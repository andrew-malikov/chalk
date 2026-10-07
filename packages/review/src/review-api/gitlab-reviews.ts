import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import type {
  GitLabIdentity,
  GitLabPosition,
  GitLabRefs,
  GitLabState,
  GitLabTarget,
} from "@dev.fast/review-protocol";
import { devReviewHome } from "@review/storage/review-home-paths.js";

import { type Pins, ReviewInputError } from "./document.js";
import {
  GitLabClient,
  GitLabRequestError,
  type GitLabRun,
  mergeRequestAddress,
  remapLineRange,
  runGitLabCommand,
} from "./gitlab.js";
import type { ReviewStore } from "./store.js";

export interface GitLabOptions {
  run?: GitLabRun;
  cloneRoot?: string;
}

export class GitLabReviews {
  private readonly run: GitLabRun;
  private readonly root: string;
  constructor(
    private readonly store: ReviewStore,
    options: GitLabOptions = {},
  ) {
    this.run = options.run ?? runGitLabCommand;
    this.root = path.resolve(
      options.cloneRoot ??
        process.env.BLACKBOARD_GITLAB_CLONES_DIR ??
        path.join(devReviewHome(), "gitlab-clones"),
    );
  }
  private client(host: string) {
    return new GitLabClient(host, this.run);
  }
  private git(cwd: string, args: string[]) {
    return this.run("git", args, { cwd, timeoutMs: 120_000 });
  }
  private directory(
    identity: Pick<GitLabIdentity, "host" | "projectId" | "iid">,
  ) {
    const existing = this.store.gitlab.find(identity);
    const pins = existing ? this.store.read(existing).pins : undefined;

    if (pins) return this.store.repositoryPath(pins.repositoryId);

    return path.join(
      this.root,
      createHash("sha256")
        .update(
          JSON.stringify([identity.host, identity.projectId, identity.iid]),
        )
        .digest("hex"),
    );
  }
  /** Exclusive source/publication lock also coordinates separate desktop hosts. A crashed lock needs explicit recovery. */
  private async locked<T>(
    identity: GitLabIdentity,
    action: () => Promise<T>,
  ): Promise<T> {
    const directory = this.directory(identity);
    await mkdir(path.dirname(directory), { recursive: true });
    const lock = directory + ".lock";

    try {
      await mkdir(lock);
    } catch {
      throw new ReviewInputError(
        `This MR has an active or interrupted operation. If no operation is running, remove its lock directory at ${lock} and retry.`,
        409,
      );
    }

    try {
      return await action();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  async create(url: string) {
    const address = mergeRequestAddress(url);
    const client = this.client(address.host);
    const metadata = await client.metadata(address.projectPath, address.iid);

    if (metadata.iid !== address.iid)
      throw new ReviewInputError("GitLab returned a different MR.");
    const project = await client.project(metadata.projectId);

    if (project.id !== metadata.projectId)
      throw new ReviewInputError("GitLab returned a different project.");
    let protocol = "https";

    try {
      protocol = (
        await this.run(
          "glab",
          ["config", "get", "git_protocol", "--host", address.host],
          { timeoutMs: 10_000 },
        )
      ).trim();
    } catch {
      /* HTTPS also works with Git credential helpers. */
    }

    const cloneUrl =
      protocol === "ssh" ? project.ssh_url_to_repo : project.http_url_to_repo;

    this.validateClone(cloneUrl, address.host);

    const identity: GitLabIdentity = {
      ...address,
      projectId: project.id,
      projectPath: project.path_with_namespace,
      cloneUrl,
    };

    const existing = this.store.gitlab.find(identity);

    if (existing) {
      const snapshot = this.store.read(existing);

      return {
        title: snapshot.title,
        pins: snapshot.pins!,
        target: snapshot.target!,
        gitlab: this.store.gitlab.read(existing),
      };
    }

    return this.locked(identity, async () => {
      const cwd = await this.acquire(identity, metadata.refs);
      const repositoryId = this.store.registerRepository(cwd).id;

      const pins = {
        repositoryId,
        base: metadata.refs.baseSha,
        head: metadata.refs.headSha,
      };

      const gitlab: GitLabState = {
        identity,
        refs: metadata.refs,
        account: await client.account(),
        discussions: await client.discussions(identity.projectId, identity.iid),
        drafts: [],
        refreshedAt: new Date().toISOString(),
      };

      await this.mapDiscussions(cwd, pins, gitlab);

      return {
        title: metadata.title.trim() || `MR !${identity.iid}`,
        pins,
        target: { kind: "commits" as const, ...pins },
        gitlab,
      };
    });
  }
  private validateClone(url: string, host: string) {
    let valid = false;

    try {
      if (url.startsWith("https://")) {
        const parsed = new URL(url);
        valid =
          parsed.host === host &&
          !parsed.username &&
          !parsed.password &&
          !parsed.search &&
          !parsed.hash;
      } else if (url.startsWith("ssh://")) {
        const parsed = new URL(url);
        valid =
          parsed.hostname === new URL("https://" + host).hostname &&
          parsed.username === "git" &&
          !parsed.password &&
          !parsed.search &&
          !parsed.hash;
      } else {
        const match = /^git@([a-zA-Z0-9.-]+):([a-zA-Z0-9_./-]+\.git)$/.exec(
          url,
        );

        valid =
          !!match &&
          match[1] === new URL("https://" + host).hostname &&
          !match[2]!.split("/").includes("..");
      }
    } catch {
      /* Invalid remote URL. */
    }

    if (!valid)
      throw new ReviewInputError(
        "GitLab clone URL must use HTTPS or Git SSH on the MR host.",
      );
  }
  private async acquire(
    identity: GitLabIdentity,
    refs: GitLabRefs,
    expected?: string,
  ) {
    this.validateClone(identity.cloneUrl, identity.host);
    const cwd = this.directory(identity);
    const missing = !existsSync(cwd);

    if (missing) {
      try {
        await this.run(
          "git",
          ["clone", "--no-checkout", "--", identity.cloneUrl, cwd],
          { timeoutMs: 120_000 },
        );
      } catch (error) {
        await rm(cwd, { recursive: true, force: true });
        throw error;
      }
    }

    const safe = async () => {
      if ((await this.git(cwd, ["status", "--porcelain"])).trim())
        throw new ReviewInputError(
          "Managed MR checkout must be clean before refresh. Keep your changes or move them out, then retry.",
          409,
        );

      if (
        expected &&
        (await this.git(cwd, ["rev-parse", "HEAD"])).trim() !== expected
      )
        throw new ReviewInputError(
          "Managed MR checkout HEAD changed locally. Preserve that commit before restoring the expected HEAD and retrying.",
          409,
        );
    };

    if (!missing) await safe();
    // Use the validated stored URL rather than trusting a locally changed origin.
    await this.git(cwd, [
      "fetch",
      "--no-tags",
      "--",
      identity.cloneUrl,
      `refs/merge-requests/${identity.iid}/head`,
    ]);

    if (
      (await this.git(cwd, ["rev-parse", "FETCH_HEAD"])).trim() !== refs.headSha
    )
      throw new ReviewInputError(
        "MR head moved during refresh. Refresh again.",
        409,
      );

    for (const sha of new Set([refs.baseSha, refs.startSha, refs.headSha])) {
      try {
        await this.git(cwd, ["cat-file", "-e", `${sha}^{commit}`]);
      } catch {
        await this.git(cwd, [
          "fetch",
          "--no-tags",
          "--",
          identity.cloneUrl,
          sha,
        ]);
      }
    }

    if (!missing) await safe();
    await this.git(cwd, ["checkout", "--detach", refs.headSha]);

    return cwd;
  }
  async refresh(id: string) {
    const initial = this.store.gitlab.read(id);

    return this.locked(initial.identity, async () => {
      const client = this.client(initial.identity.host);
      let refs: GitLabRefs;

      try {
        const metadata = await client.metadata(
          initial.identity.projectId,
          initial.identity.iid,
        );

        refs = metadata.refs;
        const account = await client.account();

        const discussions = await client.discussions(
          initial.identity.projectId,
          initial.identity.iid,
        );

        this.store.gitlab.update(id, (state) => {
          state.account = account;
          state.discussions = discussions;
          state.connectionError = undefined;
          state.refreshedAt = new Date().toISOString();
        });
      } catch {
        this.store.gitlab.update(id, (state) => {
          state.connectionError =
            "Cannot refresh GitLab. Check glab authentication for this host and your connection.";
        });

        return this.store.gitlab.read(id);
      }

      const snapshot = this.store.read(id);
      const pins = snapshot.pins!;
      let sourceError: string | undefined;

      try {
        if (refs.baseSha !== pins.base || refs.headSha !== pins.head)
          this.store.activity.assertWrite(id, undefined, "document");
        const cwd = await this.acquire(initial.identity, refs, pins.head);

        if (refs.baseSha !== pins.base || refs.headSha !== pins.head) {
          try {
            await this.store.execute({
              commandId: randomUUID(),
              operation: {
                type: "repin",
                reviewId: id,
                pins: {
                  repositoryId: pins.repositoryId,
                  base: refs.baseSha,
                  head: refs.headSha,
                },
              },
            });
          } catch (error) {
            // A lease or snapshot can change while Git fetches. Undo only our clean advancement.
            if (
              !(await this.git(cwd, ["status", "--porcelain"])).trim() &&
              (await this.git(cwd, ["rev-parse", "HEAD"])).trim() ===
                refs.headSha
            )
              await this.git(cwd, ["checkout", "--detach", pins.head]);
            throw error;
          }
        }

        // Map from original immutable commits only after the new pins have been accepted.
        const current = this.store.gitlab.read(id);

        const mapped = await Promise.all(
          current.drafts.map(async (draft) => ({
            id: draft.id,
            version: draft.version,
            target: await this.mapTarget(cwd, refs, draft.target),
          })),
        );

        this.store.gitlab.update(id, (state) => {
          state.refs = refs;

          for (const result of mapped) {
            const draft = state.drafts.find((d) => d.id === result.id);

            if (
              draft &&
              draft.version === result.version &&
              ["saved", "failed"].includes(draft.status) &&
              JSON.stringify(draft.target) !== JSON.stringify(result.target)
            ) {
              draft.target = result.target;
              draft.version++;
            }
          }
        });
      } catch (error) {
        sourceError =
          error instanceof ReviewInputError
            ? error.message
            : "Could not update the managed MR checkout. Check Git authentication and refresh.";
      }

      const state = this.store.gitlab.read(id);
      await this.mapDiscussions(
        this.directory(initial.identity),
        this.store.read(id).pins!,
        state,
      );
      this.store.gitlab.update(id, (current) => {
        current.sourceError = sourceError;
        current.discussions = state.discussions;
      });

      return this.store.gitlab.read(id);
    });
  }
  private async text(cwd: string, sha: string, file: string) {
    if (
      file.startsWith("/") ||
      file.split(/[\\/]/).includes("..") ||
      file.includes("\0")
    )
      throw new ReviewInputError("Invalid GitLab file path.");

    return this.git(cwd, ["show", `${sha}:${file}`]);
  }
  private async mapTarget(
    cwd: string,
    refs: GitLabRefs,
    target: GitLabTarget,
  ): Promise<GitLabTarget> {
    if (target.kind !== "inline") return target;

    try {
      const position = target.position;

      const file =
        position.side === "head" ? position.newPath : position.oldPath;

      const sha =
        position.side === "head" ? position.headSha : position.baseSha;

      const next = position.side === "head" ? refs.headSha : refs.baseSha;

      const range = remapLineRange(
        await this.text(cwd, sha, file),
        await this.text(cwd, next, file),
        position.from,
        position.to,
      );

      if (!range) return { ...target, unmapped: true };

      return {
        kind: "inline",
        position: await this.position(cwd, { ...position, ...refs, ...range }),
        unmapped: false,
      };
    } catch {
      return { ...target, unmapped: true };
    }
  }
  private async mapDiscussions(cwd: string, pins: Pins, state: GitLabState) {
    for (const discussion of state.discussions) {
      delete discussion.location;

      if (!discussion.position) continue;

      const target = await this.mapTarget(
        cwd,
        {
          baseSha: pins.base,
          startSha: state.refs.startSha,
          headSha: pins.head,
        },
        { kind: "inline", position: discussion.position },
      );

      if (target.kind === "inline" && !target.unmapped) {
        const p = target.position;
        discussion.location = {
          file: p.side === "head" ? p.newPath : p.oldPath,
          side: p.side,
          from: p.from,
          to: p.to,
        };
      }
    }
  }
  /** Derive opposite-side coordinates from actual hunks; never trust coordinates supplied by the renderer. */
  private async position(
    cwd: string,
    input: GitLabPosition,
  ): Promise<GitLabPosition> {
    const selectedFile = input.side === "head" ? input.newPath : input.oldPath;

    const names = (
      await this.git(cwd, [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--name-status",
        "-z",
        "--find-renames",
        input.baseSha,
        input.headSha,
      ])
    ).split("\0");

    let oldPath = selectedFile;
    let newPath = selectedFile;

    for (let index = 0; index < names.length - 1; ) {
      const status = names[index++]!;
      const old = names[index++]!;

      const next =
        status.startsWith("R") || status.startsWith("C")
          ? names[index++]!
          : old;

      if ((input.side === "head" ? next : old) === selectedFile) {
        oldPath = old;
        newPath = next;
        break;
      }
    }

    input = { ...input, oldPath, newPath };

    const text = await this.text(
      cwd,
      input.side === "head" ? input.headSha : input.baseSha,
      input.side === "head" ? input.newPath : input.oldPath,
    );

    if (input.to > text.split("\n").length)
      throw new ReviewInputError("Selected lines are unavailable.");

    const diff = await this.git(cwd, [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--unified=0",
      input.baseSha,
      input.headSha,
      "--",
      input.oldPath,
      input.newPath,
    ]);

    const hunks = [
      ...diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm),
    ].map((m) => ({
      old: Number(m[1]),
      oldCount: Number(m[2] ?? 1),
      next: Number(m[3]),
      nextCount: Number(m[4] ?? 1),
    }));

    const opposite = (line: number) => {
      let offset = 0;

      for (const h of hunks) {
        const start = input.side === "head" ? h.next : h.old;
        const count = input.side === "head" ? h.nextCount : h.oldCount;

        if (count && line >= start && line < start + count) return undefined;

        if (line < start + (count === 0 ? 1 : 0)) break;
        offset +=
          input.side === "head"
            ? h.oldCount - h.nextCount
            : h.nextCount - h.oldCount;
      }

      return line + offset;
    };

    return {
      ...input,
      oppositeFrom: opposite(input.from),
      oppositeTo: opposite(input.to),
    };
  }
  async save(id: string, input: Parameters<ReviewStore["gitlab"]["save"]>[1]) {
    if (input.target.kind === "inline") {
      const state = this.store.gitlab.read(id);
      const snapshot = this.store.read(id);
      const position = input.target.position;

      const existing = state.drafts.find((d) => d.id === input.id);

      if (
        input.target.unmapped &&
        existing?.target.kind === "inline" &&
        existing.target.unmapped &&
        JSON.stringify(existing.target) === JSON.stringify(input.target)
      )
        return this.store.gitlab.save(id, input);

      if (
        position.baseSha !== snapshot.pins?.base ||
        position.headSha !== snapshot.pins.head ||
        position.startSha !== state.refs.startSha
      )
        throw new ReviewInputError(
          "Source changed. Select the current code again.",
          409,
        );

      if (!input.target.unmapped)
        input = {
          ...input,
          target: {
            kind: "inline",
            position: await this.position(
              this.directory(state.identity),
              position,
            ),
          },
        };
    }

    return this.store.gitlab.save(id, input);
  }
  async post(id: string, draftId?: string) {
    const state = this.store.gitlab.read(id);

    return this.locked(state.identity, async () => {
      const client = this.client(state.identity.host);
      const account = await client.account();
      this.store.gitlab.update(id, (s) => {
        s.account = account;
      });

      if (state.account && state.account.id !== account.id)
        throw new ReviewInputError(
          "GitLab posting account changed. Refresh to review the account before posting again.",
          409,
        );

      const ids = draftId
        ? [draftId]
        : this.store.gitlab
            .read(id)
            .drafts.filter((d) => ["saved", "failed"].includes(d.status))
            .map((d) => d.id);

      for (const draftId of ids) {
        let draft;

        try {
          draft = this.store.gitlab.beginPost(id, draftId);
        } catch (error) {
          this.store.gitlab.update(id, (s) => {
            const d = s.drafts.find((d) => d.id === draftId);

            if (d && ["saved", "failed"].includes(d.status)) {
              d.status = "failed";
              d.error =
                error instanceof ReviewInputError
                  ? error.message
                  : "Cannot post draft.";
              d.version++;
            }
          });
          continue;
        }

        if (!draft) continue;
        let writeAttempted = false;

        try {
          if (draft.target.kind === "inline") {
            const position = draft.target.position;
            const refs = this.store.gitlab.read(id).refs;
            const pins = this.store.read(id).pins;

            if (
              position.baseSha !== refs.baseSha ||
              position.startSha !== refs.startSha ||
              position.headSha !== refs.headSha ||
              position.baseSha !== pins?.base ||
              position.headSha !== pins.head
            )
              throw new ReviewInputError(
                "Draft source changed. Refresh and select the current code before posting.",
                409,
              );

            const current = await client.metadata(
              state.identity.projectId,
              state.identity.iid,
            );

            if (
              JSON.stringify(current.refs) !==
              JSON.stringify(this.store.gitlab.read(id).refs)
            )
              throw new ReviewInputError(
                "MR changed. Refresh and verify this draft before posting.",
                409,
              );
          }

          writeAttempted = true;

          const noteId = await client.post(
            state.identity.projectId,
            state.identity.iid,
            draft.text,
            draft.target.kind === "reply"
              ? draft.target.discussionId
              : undefined,
            draft.target.kind === "inline" ? draft.target.position : undefined,
          );

          this.store.gitlab.finishPost(id, draft.id, {
            status: "sent",
            noteId,
          });
        } catch (error) {
          this.store.gitlab.finishPost(id, draft.id, {
            status:
              !writeAttempted ||
              (error instanceof ReviewInputError &&
                !(error instanceof GitLabRequestError && error.uncertain))
                ? "failed"
                : "uncertain",
            error:
              error instanceof ReviewInputError
                ? error.message
                : "GitLab did not confirm posting. Verify the MR before retrying.",
          });
        }
      }

      try {
        const discussions = await client.discussions(
          state.identity.projectId,
          state.identity.iid,
        );

        await this.mapDiscussions(
          this.directory(state.identity),
          this.store.read(id).pins!,
          { ...state, discussions },
        );
        this.store.gitlab.update(id, (s) => {
          s.discussions = discussions;
          s.connectionError = undefined;
        });
      } catch {
        this.store.gitlab.update(id, (s) => {
          s.connectionError =
            "Posting outcomes saved; discussion refresh failed. Refresh when connected.";
        });
      }

      return this.store.gitlab.read(id);
    });
  }
  async resolve(id: string, discussionId: string) {
    const state = this.store.gitlab.read(id);

    return this.locked(state.identity, async () => {
      const client = this.client(state.identity.host);
      await client.resolve(
        state.identity.projectId,
        state.identity.iid,
        discussionId,
      );
      this.store.gitlab.update(id, (s) => {
        const d = s.discussions.find((d) => d.id === discussionId);

        if (d) d.resolved = true;
      });

      return this.store.gitlab.read(id);
    });
  }
  async recover(id: string, draftId: string, posted: boolean, noteId?: number) {
    const state = this.store.gitlab.read(id);

    return this.locked(state.identity, async () => {
      this.store.gitlab.recover(id, draftId, posted, noteId);

      return this.store.gitlab.read(id);
    });
  }
}
