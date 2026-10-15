import { Database, type SQLQueryBindings } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { resolveRepoContextSync } from "@chalk/local-vcs";
import {
  type GitLabIdentity,
  type GitLabState,
  type ReviewApiSummary,
  SCRATCHPAD_REVIEW_ID,
} from "@chalk/review-contracts";
import {
  type Lens,
  applyLensEdit,
  lensEditSchema,
  lensSelections,
} from "@review/documents/diff-lenses.js";
import {
  type Applied,
  type Block,
  type EditSummary,
  type Element,
  type FileLineRange,
  type Pins,
  ReviewInputError,
  type ReviewTarget,
  type WrittenComponent,
  anchorPins,
  applyEdit,
  assertNoRetiredTraceContent,
  assignFreshIds,
  checkReferences,
  documentSchema,
  editSchema,
  elements,
  explicitPins,
  isUnit,
  pinsSchema,
  resourceReferences,
  reviewTargetSchema,
  sourceReferences,
  summarizeEdit,
} from "@review/documents/document.js";
import { sourceAnchors } from "@review/documents/lens-selection.js";
import {
  type Coverage,
  coverageSchema,
  emptyCoverage,
  updateCoverage,
} from "@review/documents/viewed-coverage.js";
import {
  liftFileLenses,
  migrateStoredDocument,
} from "@review/node/storage/stored-document-migration.js";
import { z } from "zod";

import { type LeaseScope, ReviewActivity } from "./activity.js";
import { GitLabStorage } from "./gitlab-state.js";
import { mergeRequestUrlSchema } from "./gitlab.js";

const reviewId = z.string().min(1);

/** There is one scratchpad. Its id is fixed so a skill can name it. */
export const SCRATCHPAD_ID = SCRATCHPAD_REVIEW_ID;

const DIAGRAM_TYPES = new Set([
  "sequence",
  "flow_diagram",
  "call_stack_diff",
  "database_lens",
  "software_map",
]);

export const SCRATCHPAD_TITLE = "Scratchpad";

/** The create command that makes it, with one id so a repeat is a receipt. */
const SCRATCHPAD_COMMAND_ID = "5c7a7c6e-0000-4000-8000-5c7a7c6e0000";

export const commandSchema = z.strictObject({
  commandId: z.uuid(),
  leaseId: z.uuid().optional(),
  operation: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("delete"), reviewId }),
    z.strictObject({
      type: z.literal("attention"),
      reviewId,
      action: z.enum(["view", "dismiss", "restore"]),
    }),
    z.strictObject({
      type: z.literal("create"),
      /** Required for local sources; GitLab imports default to the MR title. */
      title: z.string().trim().min(1).optional(),
      pins: pinsSchema.optional(),
      target: reviewTargetSchema.optional(),
      mergeRequestUrl: mergeRequestUrlSchema
        .optional()
        .describe(
          "GitLab MR URL; uses an independent managed clone and reopens the same MR review. Requires glab and Git authentication.",
        ),
      /** The one scratchpad: no target, no pins; every reference names its own. */
      kind: z.literal("scratchpad").optional(),
    }),
    z.strictObject({
      type: z.literal("set_target"),
      reviewId,
      target: reviewTargetSchema,
    }),
    z.strictObject({ type: z.literal("edit"), reviewId, edit: editSchema }),
    z.strictObject({
      type: z.literal("lens_edit"),
      reviewId,
      edit: lensEditSchema,
    }),
    z.strictObject({
      type: z.literal("rename"),
      reviewId,
      title: z.string().trim().min(1),
    }),
    z.strictObject({
      type: z.literal("repin"),
      reviewId,
      pins: pinsSchema,
    }),
    z.strictObject({
      type: z.literal("restore"),
      reviewId,
      version: z.number().int().nonnegative(),
    }),
  ]),
});

/** Source identity displayed in the review header and Home, alongside immutable pins. */
export interface SnapshotOrigin {
  gitlab?: GitLabIdentity;
  /** Managed tutorial; readable by ID but excluded from the user catalog. */
  tutorial?: boolean;
  branch?: string;
  baseRef?: string;
}

export interface Snapshot {
  reviewId: string;
  version: number;
  title: string;
  /** Absent for a review. The scratchpad has no pins, target or lifecycle. */
  kind?: "scratchpad";
  /** The default pins for references that name none. A document whose
   * references all carry their own pins has neither pins nor target. */
  pins?: Pins;
  target?: ReviewTarget;
  staleSources?: string[];
  sourceUnavailable?: boolean;
  document: Block[];
  /** The Diff view's lenses, beside the document and versioned with it.
   * Absent on a version with none. */
  lenses?: Lens[];
  createdAt: string;
  origin?: SnapshotOrigin;
  /** The edit that produced this version, when one did; absent for a
   * rename, repin or restore, which the canvas does not draw. */
  lastEdit?: EditSummary;
}

export interface Result {
  /** Create only: true when a new review was created. */
  created?: boolean;
  reviewId: string;
  version: number;
  /** The component an edit landed on, its type, and — for an insert or
   * replace — its first-level children with their fresh IDs. */
  targetId?: string;
  type?: Element["type"] | "lens";
  children?: WrittenComponent[];
  attention?: true;
  deleted?: true;
  warnings?: string[];
}

/** The source comparison and title resolved for a managed GitLab MR. */
export interface ResolvedMergeRequest {
  target: ReviewTarget;
  pins: Pins;
  title: string;
}

export interface ReviewProviders {
  resolveMergeRequest?(
    url: string,
  ): Promise<ResolvedMergeRequest & { gitlab: GitLabState }>;
  headBranch?(pins: Pins, headRef?: string): Promise<string | undefined>;
  projectSource?(snapshot: Snapshot, pins: Pins): Promise<Snapshot>;
  resolveTarget?(
    target: ReviewTarget,
    pinned?: Pins,
  ): Promise<{ target: ReviewTarget; pins: Pins }>;
  /** Rejects with a 404 ReviewInputError when the snapshot's checkout is gone.
   * Resolves undefined for a document without default pins. */
  sourcePins?(snapshot: Snapshot): Promise<Pins | undefined>;
  /** Ids of references whose own pins no longer name a usable checkout. */
  unavailableAnchors?(snapshot: Snapshot): Promise<string[]>;
  validatePins(pins: Pins): Promise<void>;
  validateSource(
    pins: Pins,
    source: FileLineRange,
    options: { peek: boolean },
  ): Promise<void>;
  validateResource(pins: Pins | undefined, block: Block): Promise<void>;
}

/** One instance owned by the desktop server. All writers go through execute().
 * The queue includes async validation; SQLite transactions contain only writes.
 * This prototype uses a new, explicitly supplied database, never an existing profile.
 */
export class ReviewStore {
  readonly activity: ReviewActivity;
  readonly gitlab: GitLabStorage;
  private readonly db: Database;
  private pending: Promise<unknown> = Promise.resolve();
  private closing = false;
  private readonly liveSources = new Map<string, Snapshot>();
  private refreshTimer?: ReturnType<typeof setInterval>;
  private refreshSubscribers = 0;

  watchWorktrees(): () => void {
    this.refreshSubscribers++;
    this.refreshTimer ??= setInterval(() => {
      void this.refreshWorktrees();
    }, 1000);
    this.refreshTimer.unref();

    return () => {
      if (--this.refreshSubscribers === 0) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = undefined;
      }
    };
  }

  private async projectLiveSource(
    snapshot: Snapshot,
    current = snapshot,
  ): Promise<Snapshot> {
    if (snapshot.target?.kind !== "worktree") {
      await this.providers.sourcePins?.(snapshot);

      // References with their own pins go unavailable one at a time.
      const unavailable =
        (await this.providers.unavailableAnchors?.(snapshot)) ?? [];

      const stale = [
        ...new Set([...(snapshot.staleSources ?? []), ...unavailable]),
      ];

      const staleChanged =
        JSON.stringify(stale) !== JSON.stringify(current.staleSources ?? []);

      if (!current.sourceUnavailable && !staleChanged) return current;
      const projected = { ...current, sourceUnavailable: undefined };

      if (stale.length) projected.staleSources = stale;
      else delete projected.staleSources;

      return projected;
    }

    const { pins } = await this.providers.resolveTarget!(
      snapshot.target,
      current.pins,
    );

    if (
      JSON.stringify(current.pins) === JSON.stringify(pins) &&
      !current.sourceUnavailable
    )
      return current;

    return this.providers.projectSource
      ? this.providers.projectSource(snapshot, pins)
      : { ...snapshot, pins, sourceUnavailable: undefined };
  }

  private refreshPending: Promise<void> | undefined;

  /** Refresh source state without writing authored document versions. Serialized with edits. */
  refreshWorktrees(): Promise<void> {
    if (this.closing || !this.providers.resolveTarget) return Promise.resolve();

    if (this.refreshPending) return this.refreshPending;

    const run = this.pending.then(async () => {
      for (const summary of this.list()) {
        const snapshot = this.read(summary.reviewId, summary.version);

        try {
          const live = this.liveSources.get(summary.reviewId);
          const last = live?.version === snapshot.version ? live : snapshot;
          const previous = last.pins;
          const projected = await this.projectLiveSource(snapshot, last);

          if (projected === last) continue;
          this.liveSources.set(snapshot.reviewId, projected);

          if (
            JSON.stringify(previous) !== JSON.stringify(projected.pins) ||
            JSON.stringify(last.staleSources ?? []) !==
              JSON.stringify(projected.staleSources ?? []) ||
            last.sourceUnavailable
          )
            this.notify({
              reviewId: snapshot.reviewId,
              version: snapshot.version,
            });
        } catch (error) {
          if (error instanceof ReviewInputError && error.status === 404) {
            const last = this.read(snapshot.reviewId);

            if (!last.sourceUnavailable) {
              this.liveSources.set(snapshot.reviewId, {
                ...last,
                sourceUnavailable: true,
              });
              this.notify({
                reviewId: snapshot.reviewId,
                version: snapshot.version,
              });
            }
          }
        }
      }
    });

    this.pending = run.catch(() => {});

    this.refreshPending = run.finally(() => {
      this.refreshPending = undefined;
    });

    return this.refreshPending;
  }
  private readonly listeners = new Set<(result: Result) => void>();
  private readonly catalogListeners = new Set<() => void>();
  private readonly externalChanges: ReturnType<typeof setInterval>;
  private observedDataVersion: number;
  private observedVersions = new Map<string, number>();
  subscribeCatalog(listener: () => void) {
    this.catalogListeners.add(listener);

    return () => {
      this.catalogListeners.delete(listener);
    };
  }
  /** For a host whose listing changed without the store: a preference flip. */
  invalidateCatalog(): void {
    for (const listener of this.catalogListeners)
      try {
        listener();
      } catch {
        // A disconnected viewer must not block other catalog subscribers.
      }
  }
  subscribe(listener: (result: Result) => void) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
  constructor(
    databasePath: string,
    private readonly providers: ReviewProviders,
  ) {
    // WAL plus a busy timeout: another host on the same home waits instead of failing.
    this.db = new Database(databasePath);
    this.db.exec("PRAGMA busy_timeout=5000");
    this.db.exec(`PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, version INTEGER NOT NULL, next_id INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS versions(review_id TEXT REFERENCES reviews(id), version INTEGER, snapshot TEXT NOT NULL,
        PRIMARY KEY(review_id,version));
      CREATE TABLE IF NOT EXISTS receipts(command_id TEXT PRIMARY KEY, request TEXT NOT NULL, response TEXT NOT NULL);`);
    // The lens command was "lens" before it took its tool's name.
    this.db.exec(
      "UPDATE receipts SET request=json_set(request,'$.operation.type','lens_edit') WHERE json_extract(request,'$.operation.type')='lens'",
    );
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS review_attention(review_id TEXT PRIMARY KEY REFERENCES reviews(id), viewed_at TEXT, dismissed_at TEXT);`,
    );
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS repositories(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id),
        kind TEXT NOT NULL, mime_type TEXT NOT NULL, data BLOB NOT NULL);`);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS review_coverage(review_id TEXT REFERENCES reviews(id), file TEXT, fingerprint TEXT NOT NULL, coverage TEXT NOT NULL, PRIMARY KEY(review_id,file));",
    );
    this.db.exec("DROP TABLE IF EXISTS review_viewed");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS comparison_stats(identity TEXT PRIMARY KEY, stats TEXT NOT NULL)",
    );
    // One row: which machine this store is. Review ids never contain it.
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS server_identity(one INTEGER PRIMARY KEY CHECK(one=1), id TEXT NOT NULL)",
    );
    // Batch authoring's scratch drafts were removed; drop their leftover table.
    this.db.exec("DROP TABLE IF EXISTS authoring_drafts");
    this.activity = new ReviewActivity(this.db, (id) => this.assertExists(id));
    this.gitlab = new GitLabStorage(this.db);

    this.observedDataVersion = this.dataVersion();
    this.observedVersions = this.currentVersions();
    this.externalChanges = setInterval(
      () => this.refreshExternalChanges(),
      250,
    );
    this.externalChanges.unref();
  }

  private dataVersion() {
    return Number(
      this.db
        .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
          "PRAGMA data_version",
        )
        .get()!.data_version,
    );
  }

  private currentVersions() {
    return new Map(
      this.db
        .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
          "SELECT id,version FROM reviews",
        )
        .all()
        .map((row) => [String(row.id), Number(row.version)]),
    );
  }

  private refreshExternalChanges() {
    const version = this.dataVersion();

    if (version === this.observedDataVersion) return;
    this.observedDataVersion = version;
    const current = this.currentVersions();
    const previous = this.observedVersions;
    this.observedVersions = current;

    for (const [reviewId, savedVersion] of current)
      if (previous.get(reviewId) !== savedVersion)
        this.notify({ reviewId, version: savedVersion });

    for (const [reviewId, savedVersion] of previous)
      if (!current.has(reviewId)) {
        this.activity.deleted(reviewId);
        this.notify({ reviewId, version: savedVersion, deleted: true });
      }

    this.activity.refresh();

    // Attention and repository/resource changes need catalog invalidation too.
    for (const listener of this.catalogListeners) {
      try {
        listener();
      } catch {
        /* Disconnected readers do not stop polling. */
      }
    }
  }
  /** Reader progress never creates a document version or authoring event. */
  viewedCoverage(
    reviewId: string,
  ): Map<string, { fingerprint: string; coverage: Coverage }> {
    this.assertExists(reviewId);

    return new Map(
      this.db
        .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
          "SELECT file,fingerprint,coverage FROM review_coverage WHERE review_id=?",
        )
        .all(reviewId)
        .map((row) => [
          String(row.file),
          {
            fingerprint: String(row.fingerprint),
            coverage: coverageSchema.parse(JSON.parse(String(row.coverage))),
          },
        ]),
    );
  }
  updateViewedCoverage(
    reviewId: string,
    files: { path: string; fingerprint: string; scope: Coverage }[],
    viewed: boolean,
  ): void {
    this.assertExists(reviewId);
    this.db.exec("BEGIN IMMEDIATE");

    try {
      const current = this.viewedCoverage(reviewId);

      for (const file of files) {
        const previous = current.get(file.path);

        const coverage = updateCoverage(
          previous?.fingerprint === file.fingerprint
            ? previous.coverage
            : emptyCoverage(),
          file.scope,
          viewed,
        );

        this.db
          .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
            "INSERT OR REPLACE INTO review_coverage(review_id,file,fingerprint,coverage) VALUES(?,?,?,?)",
          )
          .run(reviewId, file.path, file.fingerprint, JSON.stringify(coverage));
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private readonly repositoryGroups = new Map<
    string,
    ReviewApiSummary["repositoryGroup"]
  >();

  private repositoryGroup(root: string): ReviewApiSummary["repositoryGroup"] {
    if (this.repositoryGroups.has(root)) return this.repositoryGroups.get(root);

    const context = resolveRepoContextSync(root);

    if (!context) return undefined;

    const group = context.githubSlug
      ? {
          key: `remote:https://github.com/${context.githubSlug.toLowerCase()}.git`,
          label: context.githubSlug,
        }
      : {
          key: `git:${context.commonDir}`,
          label: path.basename(path.dirname(context.commonDir)),
        };

    this.repositoryGroups.set(root, group);

    return group;
  }

  registerRepository(root: string) {
    this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "INSERT OR IGNORE INTO repositories(id,path,name) VALUES(?,?,?)",
      )
      .run(randomUUID(), root, root.split(/[\\/]/).at(-1)!);

    const row = this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "SELECT id,name FROM repositories WHERE path=?",
      )
      .get(root)!;

    return { id: String(row.id), name: String(row.name) };
  }
  unregisterRepository(id: string) {
    this.db
      // Document pins and per-reference pins both spell the id in the snapshot.
      .query<
        Record<string, SQLQueryBindings>,
        SQLQueryBindings[]
      >(`DELETE FROM repositories WHERE id=?
      AND NOT EXISTS (SELECT 1 FROM versions WHERE instr(snapshot, ?) > 0)
      AND NOT EXISTS (SELECT 1 FROM resources WHERE repository_id=?)`)
      .run(id, `"repositoryId":${JSON.stringify(id)}`, id);
  }
  /** Registered checkouts, oldest registration first. */
  repositories() {
    return this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "SELECT id,path FROM repositories ORDER BY rowid",
      )
      .all()
      .map((row) => ({ id: String(row.id), path: String(row.path) }));
  }
  repositoryPath(id: string) {
    const row = this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "SELECT path FROM repositories WHERE id=?",
      )
      .get(id);

    if (!row) throw new ReviewInputError("Repository is not registered.", 404);

    return String(row.path);
  }
  putResource(
    id: string,
    repositoryId: string,
    kind: string,
    mimeType: string,
    data: Uint8Array,
  ) {
    this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "INSERT OR IGNORE INTO resources(id,repository_id,kind,mime_type,data) VALUES(?,?,?,?,?)",
      )
      .run(id, repositoryId, kind, mimeType, data);
    const saved = this.resource(id);

    if (
      saved.repositoryId !== repositoryId ||
      saved.kind !== kind ||
      saved.mimeType !== mimeType ||
      !Buffer.from(saved.data).equals(data)
    )
      throw new ReviewInputError(
        "Resource ID was already used for different content.",
        409,
      );

    return { id, kind, mimeType };
  }
  resource(id: string) {
    const row = this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "SELECT * FROM resources WHERE id=?",
      )
      .get(id);

    if (!row) throw new ReviewInputError("Resource not found.", 404);

    return {
      id,
      repositoryId: String(row.repository_id),
      kind: String(row.kind),
      mimeType: String(row.mime_type),
      // SAFETY: resources.data is a BLOB written by putResource; bun:sqlite returns Uint8Array.
      data: row.data as Uint8Array,
    };
  }
  async close() {
    this.closing = true;
    clearInterval(this.externalChanges);
    clearInterval(this.refreshTimer);
    await this.pending;
    this.listeners.clear();
    this.catalogListeners.clear();
    this.activity.close();
    this.db.close();
  }
  /** Stable across restarts; the first host on a new store chooses it. */
  serverId(): string {
    const read = () =>
      this.db
        .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
          "SELECT id FROM server_identity",
        )
        .get()?.id;

    let id = read();

    if (id === undefined) {
      // Another host may insert first; its id wins.
      this.db
        .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
          "INSERT OR IGNORE INTO server_identity(one,id) VALUES(1,?)",
        )
        .run(randomUUID());
      id = read();
    }

    return String(id);
  }
  resetServerId(): string {
    const id = randomUUID();
    this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "INSERT OR REPLACE INTO server_identity(one,id) VALUES(1,?)",
      )
      .run(id);

    return id;
  }
  /** The 404 check alone, without loading a snapshot. */
  assertExists(id: string) {
    if (
      !this.db
        .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
          "SELECT 1 FROM reviews WHERE id=?",
        )
        .get(id)
    )
      throw new ReviewInputError("Review not found.", 404);
  }
  read(id: string, version?: number): Snapshot {
    const row =
      version === undefined
        ? this.db
            .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
              "SELECT snapshot FROM versions JOIN reviews ON reviews.id=review_id AND reviews.version=versions.version WHERE reviews.id=?",
            )
            .get(id)
        : this.db
            .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
              "SELECT snapshot FROM versions WHERE review_id=? AND version=?",
            )
            .get(id, version);

    if (!row) throw new ReviewInputError("Review or version not found.", 404);

    // SAFETY: snapshot metadata was validated on write; its document is revalidated below.
    const snapshot = JSON.parse(String(row.snapshot)) as Snapshot;
    assertNoRetiredTraceContent(snapshot.document);

    const { document, lenses } = liftFileLenses(
      migrateStoredDocument(snapshot.document),
    );

    snapshot.document = documentSchema.parse(document);
    checkReferences(snapshot.document);

    if (lenses.length)
      snapshot.lenses = [...(snapshot.lenses ?? []), ...lenses];

    if (snapshot.pins)
      snapshot.target ??= {
        kind: "commits",
        repositoryId: snapshot.pins.repositoryId,
        base: snapshot.pins.base,
        head: snapshot.pins.head,
      };
    const live = version === undefined ? this.liveSources.get(id) : undefined;

    if (live?.version === snapshot.version) {
      assertNoRetiredTraceContent(live.document);
      checkReferences(documentSchema.parse(live.document));

      return structuredClone(live);
    }

    return snapshot;
  }
  setDiffStats(
    pins: Pins,
    stats: NonNullable<ReviewApiSummary["diffStats"]>,
    mode: "structural" | "textual" = "structural",
  ) {
    if (this.closing) return;
    this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "INSERT OR REPLACE INTO comparison_stats(identity, stats) VALUES (?, ?)",
      )
      .run(JSON.stringify([pins, mode]), JSON.stringify(stats));

    for (const listener of this.catalogListeners) {
      try {
        listener();
      } catch {
        /* A disconnected viewer must not block other catalog subscribers. */
      }
    }
  }

  /** Managed records are discoverable even if their preparation stamp was lost. */
  tutorialIds(): string[] {
    return this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        `SELECT reviews.id FROM reviews JOIN versions ON versions.review_id=reviews.id AND versions.version=reviews.version WHERE json_extract(versions.snapshot,'$.origin.tutorial') = 1`,
      )
      .all()
      .map((row) => String(row.id));
  }

  list(mode: "structural" | "textual" = "structural"): ReviewApiSummary[] {
    return this.summaries(mode);
  }
  /** One review's catalog entry, as review_list shows it. */
  summary(id: string): ReviewApiSummary | undefined {
    return this.summaries("structural", id)[0];
  }
  private summaries(
    mode: "structural" | "textual",
    id?: string,
  ): ReviewApiSummary[] {
    // One query, and the document never leaves SQLite: every catalog watcher
    // re-lists on every command.

    const reviews = this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        `SELECT json_remove(versions.snapshot,'$.document') AS summary,
          (SELECT json_extract(first.snapshot,'$.createdAt') FROM versions AS first WHERE first.review_id=reviews.id ORDER BY first.version LIMIT 1) AS first_created_at,
          review_attention.viewed_at, review_attention.dismissed_at, repositories.name AS repository_name, repositories.path AS repository_path
        FROM reviews
        JOIN versions ON versions.review_id=reviews.id AND versions.version=reviews.version
        LEFT JOIN review_attention ON review_attention.review_id=reviews.id
        LEFT JOIN repositories ON repositories.id=json_extract(versions.snapshot,'$.pins.repositoryId')
        WHERE COALESCE(json_extract(versions.snapshot,'$.origin.tutorial'), 0) = 0
        ${id === undefined ? "" : "AND reviews.id=?"}
        ORDER BY reviews.rowid`,
      )
      .all(...(id === undefined ? [] : [id]))
      .map((row) => {
        // SAFETY: versions contains only snapshots validated by execute before committing.
        const summary = JSON.parse(String(row.summary)) as Omit<
          Snapshot,
          "document"
        >;

        if (summary.pins)
          summary.target ??= {
            kind: "commits",
            repositoryId: summary.pins.repositoryId,
            base: summary.pins.base,
            head: summary.pins.head,
          };

        const live = this.liveSources.get(summary.reviewId);

        if (
          live?.version === summary.version &&
          summary.target?.kind === "worktree"
        )
          summary.pins = live.pins;

        // Managed GitLab clones live in hashed directories, so name them by project.
        const gitlab = summary.origin?.gitlab;

        const listed: ReviewApiSummary = {
          ...summary,
          firstCreatedAt: row.first_created_at
            ? String(row.first_created_at)
            : undefined,
          repositoryPath: row.repository_path
            ? String(row.repository_path)
            : undefined,
          repositoryGroup: gitlab
            ? {
                key: `remote:https://${gitlab.host}/${gitlab.projectPath.toLowerCase()}.git`,
                label: gitlab.projectPath,
              }
            : row.repository_path
              ? this.repositoryGroup(String(row.repository_path))
              : undefined,
          repositoryName:
            gitlab?.projectPath ??
            (row.repository_name
              ? String(row.repository_name)
              : (summary.pins?.repositoryId ?? "")),
          viewedAt: row.viewed_at ? String(row.viewed_at) : null,
          dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
          working: this.activity.isWorking(summary.reviewId),
        };

        if (summary.kind === "scratchpad")
          listed.contents = this.scratchpadContents();

        return listed;
      });

    return this.withDiffStats(reviews, mode);
  }

  /** Summaries use the same persisted, mode-specific counts. */
  withDiffStats<T extends ReviewApiSummary>(
    reviews: T[],
    mode: "structural" | "textual" = "structural",
  ): T[] {
    const stats = new Map(
      this.db
        .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
          "SELECT identity, stats FROM comparison_stats",
        )
        .all()
        .map((row) => [
          String(row.identity),
          // SAFETY: comparison_stats is written only from the validated diff-stats contract.
          JSON.parse(String(row.stats)) as NonNullable<
            ReviewApiSummary["diffStats"]
          >,
        ]),
    );

    return reviews.map((review) => ({
      ...review,
      diffStats: review.pins
        ? (stats.get(JSON.stringify([review.pins, mode])) ?? null)
        : null,
    }));
  }

  /** What the pad holds, for its Home card: blocks, and the diagrams among them. */
  private scratchpadContents(): NonNullable<ReviewApiSummary["contents"]> {
    const blocks = elements(this.read(SCRATCHPAD_ID).document).filter(
      (element) => !isUnit(element),
    );

    return {
      blocks: blocks.length,
      diagrams: blocks.filter((block) => DIAGRAM_TYPES.has(block.type)).length,
    };
  }
  /** The one scratchpad, made on first use. The fixed command id makes a
   * repeat, even from another host on the same home, find its receipt. */
  async ensureScratchpad(): Promise<void> {
    if (this.has(SCRATCHPAD_ID)) return;

    try {
      await this.execute({
        commandId: SCRATCHPAD_COMMAND_ID,
        operation: {
          type: "create",
          title: SCRATCHPAD_TITLE,
          kind: "scratchpad",
        },
      });
    } catch (error) {
      if (!this.has(SCRATCHPAD_ID)) throw error;
    }
  }
  history(id: string) {
    return this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "SELECT version,json_extract(snapshot,'$.title') AS title,json_extract(snapshot,'$.createdAt') AS created_at FROM versions WHERE review_id=? ORDER BY version",
      )
      .all(id)
      .map((row) => ({
        version: Number(row.version),
        title: String(row.title),
        createdAt: String(row.created_at),
      }));
  }
  inspect(id: string, targetId?: string, version?: number) {
    const snapshot = this.read(id, version);

    return inspectSnapshot(snapshot, targetId);
  }
  /** The host can seed a managed document; transport callers only supply a command. */
  execute(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Command boundary: commandSchema.parse below rejects malformed input before mutation.
    input: unknown,
    initial?: { document: Block[]; origin: SnapshotOrigin },
  ): Promise<Result> {
    if (this.closing)
      return Promise.reject(new Error("Review store is closing."));
    const command = commandSchema.parse(input);

    if (initial && command.operation.type !== "create")
      throw new ReviewInputError("Initial content requires a create command.");
    const request = JSON.stringify(initial ? { command, initial } : command);

    // Network and fetch time stay out of the write queue. A replayed command
    // never uses this: its receipt answers first, below.
    if (
      command.operation.type === "create" &&
      command.operation.mergeRequestUrl &&
      (command.operation.pins ||
        command.operation.target ||
        command.operation.kind)
    )
      throw new ReviewInputError(
        "mergeRequestUrl cannot be combined with local source or scratchpad.",
      );

    const mergeRequest =
      command.operation.type === "create" &&
      command.operation.mergeRequestUrl &&
      !this.db
        .query("SELECT 1 FROM receipts WHERE command_id=?")
        .get(command.commandId)
        ? this.providers.resolveMergeRequest?.(
            command.operation.mergeRequestUrl,
          )
        : undefined;

    mergeRequest?.catch(() => {});

    const run = this.pending.then(async () => {
      const receipt = this.db
        .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
          "SELECT request,response FROM receipts WHERE command_id=?",
        )
        .get(command.commandId);

      if (receipt) {
        if (receipt.request === "null")
          throw new ReviewInputError("This command's review was deleted.", 404);

        if (
          !isDeepStrictEqual(
            JSON.parse(String(receipt.request)),
            JSON.parse(request),
          )
        )
          throw new ReviewInputError(
            "Command ID was already used for different input.",
            409,
          );

        // SAFETY: receipts store only Results this method built, never caller-provided JSON.
        return JSON.parse(String(receipt.response)) as Result;
      }

      const op = command.operation;

      if (op.type !== "create" && op.type !== "attention") {
        this.activity.assertWrite(op.reviewId, command.leaseId, scopeOf(op));
      }

      // The scratchpad is edited and restored like a review, and nothing else.
      if (
        op.type !== "create" &&
        op.type !== "edit" &&
        op.type !== "lens_edit" &&
        op.type !== "restore" &&
        this.read(op.reviewId).kind === "scratchpad"
      )
        throw new ReviewInputError(
          "The scratchpad has no lifecycle, title or pins of its own.",
          409,
        );

      if (op.type === "create" && op.kind === "scratchpad") {
        if (op.pins || op.target)
          throw new ReviewInputError(
            "A scratchpad has no target or pins of its own.",
          );

        if (this.has(SCRATCHPAD_ID))
          throw new ReviewInputError("The scratchpad already exists.", 409);
      } else if (op.type === "create") {
        if (op.pins && op.target)
          throw new ReviewInputError(
            "Supply exactly one of target or legacy pins.",
          );

        if (!op.pins && !op.target && !op.mergeRequestUrl)
          throw new ReviewInputError(
            "Supply a target, legacy pins, or a mergeRequestUrl.",
          );

        if (!op.title && (op.pins || op.target))
          throw new ReviewInputError("Supply a title.");
      }

      if (op.type === "set_target" && this.read(op.reviewId).origin?.gitlab)
        throw new ReviewInputError(
          "GitLab MR source is managed. Use GitLab Refresh to update it.",
          409,
        );

      if (
        op.type === "repin" &&
        this.read(op.reviewId).origin?.gitlab &&
        op.pins.repositoryId !== this.read(op.reviewId).pins?.repositoryId
      )
        throw new ReviewInputError(
          "GitLab MR source must stay in its managed clone.",
          409,
        );

      const requestedTarget =
        op.type === "create" || op.type === "set_target"
          ? op.target
          : undefined;

      const fromMergeRequest = await mergeRequest;

      if (op.type === "create" && op.mergeRequestUrl && !fromMergeRequest)
        throw new ReviewInputError("GitLab MR targets are unavailable.");

      if (fromMergeRequest) {
        const existing = this.gitlab.find(fromMergeRequest.gitlab.identity);

        if (existing) {
          const result: Result = {
            reviewId: existing,
            version: this.read(existing).version,
          };

          this.db
            .query(
              "INSERT INTO receipts(command_id,request,response) VALUES(?,?,?)",
            )
            .run(command.commandId, request, JSON.stringify(result));

          return result;
        }
      }

      const resolvedTarget = requestedTarget
        ? await this.providers.resolveTarget?.(requestedTarget)
        : fromMergeRequest;

      if (requestedTarget && !resolvedTarget)
        throw new ReviewInputError("Review targets are unavailable.");

      if (op.type === "delete") {
        const result: Result = {
          reviewId: op.reviewId,
          version: this.read(op.reviewId).version,
          deleted: true,
        };

        this.commitCommand(
          command.commandId,
          request,
          result,
          () => {
            for (const table of [
              "gitlab_reviews",
              "authoring_sessions",
              "review_coverage",
              "review_attention",
              "versions",
            ])
              this.db
                .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
                  `DELETE FROM ${table} WHERE review_id=?`,
                )
                .run(op.reviewId);
            this.db
              .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
                "DELETE FROM reviews WHERE id=?",
              )
              .run(op.reviewId);
            // Keep command IDs so a delayed retry cannot recreate deleted content.
            // Erase their saved inputs while retaining the retry record.
            this.db
              .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
                "UPDATE receipts SET request='null',response=? WHERE json_extract(response,'$.reviewId')=?",
              )
              .run(JSON.stringify(result), op.reviewId);
          },
          () =>
            this.assertMutation(op.reviewId, result.version, command.leaseId),
        );

        return result;
      }

      if (op.type === "attention") {
        const result: Result = {
          reviewId: op.reviewId,
          version: this.read(op.reviewId).version,
          attention: true,
        };

        this.commitCommand(command.commandId, request, result, () => {
          this.db
            .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
              "INSERT OR IGNORE INTO review_attention(review_id) VALUES(?)",
            )
            .run(op.reviewId);

          if (op.action === "view")
            this.db
              .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
                "UPDATE review_attention SET viewed_at=? WHERE review_id=?",
              )
              .run(new Date().toISOString(), op.reviewId);
          else
            this.db
              .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
                "UPDATE review_attention SET dismissed_at=? WHERE review_id=?",
              )
              .run(
                op.action === "dismiss" ? new Date().toISOString() : null,
                op.reviewId,
              );
        });

        return result;
      }

      const id =
        op.type !== "create"
          ? op.reviewId
          : op.kind === "scratchpad"
            ? SCRATCHPAD_ID
            : randomUUID();

      const previous = op.type === "create" ? undefined : this.read(id);

      let snapshot: Snapshot =
        op.type === "create"
          ? createdSnapshot(id, op, resolvedTarget, fromMergeRequest?.title)
          : structuredClone(previous!);

      // Overlay state: a degraded read must not persist unavailability.
      delete snapshot.sourceUnavailable;
      // Each version describes only its own edit.
      delete snapshot.lastEdit;

      let nextId = previous
        ? Number(
            this.db
              .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
                "SELECT next_id FROM reviews WHERE id=?",
              )
              .get(id)!.next_id,
          )
        : 0;

      let applied: Applied | undefined;
      let lensTarget: { targetId: string; type: "lens" } | undefined;

      if (
        (op.type === "create" ||
          op.type === "set_target" ||
          op.type === "repin") &&
        this.providers.headBranch
      ) {
        const pins =
          resolvedTarget?.pins ??
          (op.type === "repin" ? op.pins : snapshot.pins);

        if (pins) {
          const headRef =
            requestedTarget?.kind === "commits"
              ? requestedTarget.head
              : undefined;

          const branch = await this.providers.headBranch(pins, headRef);

          snapshot.origin = { ...snapshot.origin, branch };
        }
      }

      switch (op.type) {
        case "create":
          if (initial) {
            snapshot.document = documentSchema.parse(initial.document);
            snapshot.origin = {
              ...snapshot.origin,
              ...structuredClone(initial.origin),
            };

            for (const block of snapshot.document)
              assignFreshIds(block, (prefix) => `${prefix}-${++nextId}`);
          }

          if (fromMergeRequest)
            snapshot.origin = {
              ...snapshot.origin,
              gitlab: fromMergeRequest.gitlab.identity,
            };
          break;
        case "rename":
          snapshot.title = op.title;
          break;
        case "set_target":
          snapshot.staleSources = [];
          snapshot.target = resolvedTarget!.target;
          snapshot.pins = resolvedTarget!.pins;
          break;
        case "repin":
          snapshot.staleSources = [];
          snapshot.pins = op.pins;
          snapshot.target = { kind: "commits", ...op.pins };
          break;
        case "restore":
          snapshot = this.read(id, op.version);
          delete snapshot.lastEdit;
          break;
        case "lens_edit": {
          if (snapshot.kind === "scratchpad")
            throw new ReviewInputError(
              "The scratchpad has no changes of its own to lens.",
              409,
            );

          const lenses = snapshot.lenses ?? [];
          const lens = applyLensEdit(lenses, op.edit, () => `lens-${++nextId}`);

          if (lenses.length) snapshot.lenses = lenses;
          else delete snapshot.lenses;
          lensTarget = { targetId: lens.id, type: "lens" };
          snapshot.lastEdit = {
            type: op.edit.type,
            targetId: lens.id,
            blockId: lens.id,
            kind: "lens",
            ...(op.edit.type === "update" && {
              fields: Object.keys(op.edit).filter(
                (key) => key !== "type" && key !== "targetId",
              ),
            }),
          };
          break;
        }

        case "edit": {
          applied = applyEdit(
            snapshot.document,
            op.edit,
            (prefix) => `${prefix}-${++nextId}`,
            // The scratchpad is a running log: the newest thought goes on top.
            { placement: snapshot.kind === "scratchpad" ? "first" : "last" },
          );

          snapshot.lastEdit = summarizeEdit(
            op.edit,
            applied,
            previous!.document,
            snapshot.document,
          );

          if (snapshot.staleSources?.length) {
            const oldSources = new Map(
              sourceReferences(previous!.document).map((item) => [
                item.id,
                JSON.stringify(item.source),
              ]),
            );

            const newSources = new Map(
              sourceReferences(snapshot.document).map((item) => [
                item.id,
                JSON.stringify(item.source),
              ]),
            );

            snapshot.staleSources = snapshot.staleSources.filter(
              (id) =>
                oldSources.get(id) === newSources.get(id) && newSources.has(id),
            );
          }

          break;
        }
      }

      if (
        snapshot.target?.kind === "worktree" &&
        op.type !== "restore" &&
        !resolvedTarget
      ) {
        snapshot = await this.projectLiveSource(snapshot);
      }

      // Component shapes were checked at entry (or when merging a field patch).
      // Check cross-references here; do not reparse the whole stored document.
      checkReferences(snapshot.document);

      if (
        snapshot.pins &&
        (!previous ||
          JSON.stringify(previous.pins) !== JSON.stringify(snapshot.pins))
      )
        await this.providers.validatePins(snapshot.pins);

      const warnings = await this.validateExternal(
        snapshot,
        previous,
        op.type === "repin" || op.type === "set_target",
      );

      snapshot.version = previous ? previous.version + 1 : 0;
      snapshot.createdAt = new Date().toISOString();

      const result: Result = {
        ...(op.type === "create" && { created: true }),
        reviewId: id,
        version: snapshot.version,
        targetId: applied?.targetId ?? lensTarget?.targetId,
        ...(applied && { type: applied.type }),
        ...(lensTarget && { type: lensTarget.type }),
        ...(applied?.children && { children: applied.children }),
      };

      if (snapshot.staleSources?.length)
        warnings.push(
          "Some authored source ranges changed. Update their references before presenting this review.",
        );

      if (warnings.length) result.warnings = warnings;

      this.commitCommand(
        command.commandId,
        request,
        result,
        () => {
          this.db
            .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
              "INSERT INTO reviews(id,version,next_id) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,next_id=excluded.next_id",
            )
            .run(id, snapshot.version, nextId);

          if (fromMergeRequest) this.gitlab.seed(id, fromMergeRequest.gitlab);
          this.db
            .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
              "INSERT INTO versions(review_id,version,snapshot) VALUES(?,?,?)",
            )
            .run(id, snapshot.version, JSON.stringify(snapshot));
        },
        previous
          ? () =>
              this.assertMutation(
                id,
                previous.version,
                command.leaseId,
                scopeOf(op),
              )
          : undefined,
        command.leaseId,
        scopeOf(op),
      );

      return result;
    });

    this.pending = run.catch(() => {});

    return run;
  }
  private commitCommand(
    commandId: string,
    request: string,
    result: Result,
    apply: () => void,
    guard?: () => void,
    leaseId?: string,
    scope: LeaseScope = "document",
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    let extended = false;

    try {
      guard?.();
      apply();
      this.db
        .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
          "INSERT INTO receipts(command_id,request,response) VALUES(?,?,?)",
        )
        .run(commandId, request, JSON.stringify(result));
      // An accepted write is proof of life: it renews the author's lease.
      extended = this.activity.extend(result.reviewId, leaseId, scope);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    if (result.deleted) this.activity.deleted(result.reviewId);
    else if (extended) this.activity.extended(result.reviewId);
    this.notify(result);
  }
  private assertMutation(
    reviewId: string,
    version: number | undefined,
    leaseId?: string,
    scope: LeaseScope = "document",
  ) {
    this.activity.assertWrite(reviewId, leaseId, scope);

    const current = this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "SELECT version FROM reviews WHERE id=?",
      )
      .get(reviewId);

    if ((current ? Number(current.version) : undefined) !== version)
      throw new ReviewInputError(
        "Review changed during validation. Reread it and retry the edit.",
        409,
      );
  }

  private notify(result: Result) {
    if (result.deleted) this.observedVersions.delete(result.reviewId);
    else if (!result.attention)
      this.observedVersions.set(result.reviewId, result.version);

    if (!result.attention)
      for (const listener of this.listeners)
        try {
          listener(result);
        } catch {
          // A subscriber failure must not reject the committed command.
        }

    for (const listener of this.catalogListeners)
      try {
        listener();
      } catch {
        // The saved command must remain successful if a viewer disconnects.
      }
  }
  /** Dismissed reviews, as Home lists them; only a restore clears it, not a view. */
  dismissedIds(): string[] {
    return this.db
      .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
        "SELECT review_id FROM review_attention WHERE dismissed_at IS NOT NULL",
      )
      .all()
      .map((row) => String(row.review_id));
  }
  has(reviewId: string): boolean {
    return (
      this.db
        .query<Record<string, SQLQueryBindings>, SQLQueryBindings[]>(
          "SELECT 1 FROM reviews WHERE id=?",
        )
        .get(reviewId) !== null
    );
  }
  private async validateExternal(
    snapshot: Snapshot,
    previous?: Snapshot,
    repin = false,
  ) {
    const warnings: string[] = [];

    const references = (
      document: Block[],
      tolerant = false,
      lenses: readonly Lens[] = [],
    ) => {
      const sources = new Map<
        string,
        { source: FileLineRange; peek: boolean }
      >();

      const resources = new Map<string, Block>();

      const add = (source: FileLineRange, peek: boolean) => {
        const key = JSON.stringify(source);
        const kept = sources.get(key);
        sources.set(key, { source, peek: peek || (kept?.peek ?? false) });
      };

      for (const { source, peek } of sourceReferences(document, { tolerant }))
        add(source, peek === true);

      // A lens range is a prose-like link: it must exist, not read as a peek.
      for (const { source } of lensSelections(lenses))
        for (const anchor of sourceAnchors(source)) add(anchor, false);

      for (const block of resourceReferences(document))
        resources.set(JSON.stringify(block), block);

      return { sources, resources };
    };

    const current = references(snapshot.document, repin, snapshot.lenses);

    // Stored content is not re-validated: an edit may fix a link that the
    // current rules reject.
    const pinsChanged =
      previous &&
      JSON.stringify(previous.pins) !== JSON.stringify(snapshot.pins);

    const worktreeMoved = pinsChanged && snapshot.target?.kind === "worktree";

    const retained = references(
      previous?.document ?? [],
      true,
      previous?.lenses,
    );

    // Independent reads of immutable commits: run them concurrently.
    const checks: Promise<void>[] = [];

    // Pins a reference names itself must be resolved commits of a registered
    // repository, like document pins. Check each distinct new set once.
    const retainedPins = new Set(
      explicitPins([...retained.sources.values()]).map((pins) =>
        JSON.stringify(pins),
      ),
    );

    for (const pins of explicitPins([...current.sources.values()]))
      if (!retainedPins.has(JSON.stringify(pins)))
        checks.push(this.providers.validatePins(pins));

    for (const [key, { source, peek }] of current.sources) {
      const kept = retained.sources.get(key);

      // A range validated earlier as a prose link still needs the peek check
      // the first time a code peek points at it. A reference with its own
      // pins is unaffected by the document's pins changing.
      if ((pinsChanged && !source.pins) || !kept || (peek && !kept.peek))
        checks.push(
          this.providers
            .validateSource(anchorPins(source, snapshot.pins), source, {
              peek,
            })
            .then(
              () => {
                if (repin)
                  warnings.push(
                    `${source.side}/${source.file}#L${source.fromLine}-L${source.toLine}: source pins changed; verify that this range still supports the document.`,
                  );
              },
              (error) => {
                if (
                  (!repin && !(worktreeMoved && kept)) ||
                  !(error instanceof ReviewInputError)
                )
                  throw error;
                warnings.push(
                  `${source.side}/${source.file}#L${source.fromLine}-L${source.toLine}: ${error.message}`,
                );
              },
            ),
        );
    }

    for (const [key, block] of current.resources)
      if (pinsChanged || !retained.resources.has(key))
        checks.push(
          this.providers
            .validateResource(snapshot.pins, block)
            .catch((error) => {
              if (
                (!repin && !(worktreeMoved && retained.resources.has(key))) ||
                !(error instanceof ReviewInputError)
              )
                throw error;
              warnings.push(`${block.id} (${block.type}): ${error.message}`);
            }),
        );

    await Promise.all(checks);

    return warnings.sort();
  }
}

/** Lens writes need the lenses lease; every other write needs the document's. */
function scopeOf(operation: { type: string }): LeaseScope {
  return operation.type === "lens_edit" ? "lenses" : "document";
}

/** A new document's first version, before its initial content. Field order
 * is kept so stored JSON reads as it always has. */
function createdSnapshot(
  id: string,
  op: {
    title?: string;
    kind?: "scratchpad";
    pins?: z.infer<typeof pinsSchema>;
  },
  resolved: { target: ReviewTarget; pins: Pins } | undefined,
  defaultTitle?: string,
): Snapshot {
  const pins = resolved?.pins ?? op.pins;
  const title = op.title ?? defaultTitle;

  if (!title) throw new ReviewInputError("Supply a title.");

  if (!pins)
    return {
      reviewId: id,
      version: 0,
      title,
      kind: op.kind,
      document: [],
      createdAt: "",
    };

  return {
    reviewId: id,
    version: 0,
    title,
    pins,
    target: resolved?.target ?? { kind: "commits", ...pins },
    document: [],
    createdAt: "",
  };
}

export function inspectSnapshot(snapshot: Snapshot, targetId?: string) {
  if (targetId !== undefined) {
    const target = elements(snapshot.document).find(
      (element) => element.id === targetId,
    );

    if (!target)
      throw new ReviewInputError("Target not found in this version.", 404);

    return target;
  }

  return elements(snapshot.document).map((element) => ({
    id: element.id,
    type: element.type,
    label:
      "title" in element
        ? element.title
        : "label" in element
          ? element.label
          : element.type === "markdown"
            ? element.markdown.slice(0, 120)
            : undefined,
  }));
}
