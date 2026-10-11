import { createHash } from "node:crypto";

import { type JsonObject, isJsonObject } from "@dev.fast/json";
import {
  REVIEW_CLIENT_HEADER,
  REVIEW_CLIENT_REMOTE,
  type ReviewStructuralDiffEvent,
  gitLabSaveDraftSchema,
} from "@dev.fast/review-protocol";
import { scopedCoverage } from "@review/documents/viewed-coverage.js";
import { errorMessage } from "@review/lib/error-message";
import {
  type AgentSelection,
  AgentSelectionSchema,
  selectionMarkdown,
} from "@review/review-api/agent-selection.js";
import { readBoundedRequestJson } from "@review/server/hono-http.js";
import { HttpJsonError } from "@review/server/http-json.js";
import type { ReviewSessionAgent } from "@review/telemetry/ui-telemetry-events.js";
import { resolveReviewStackLayers } from "@review/vcs/review-stack.js";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";

import { authoringTools } from "./authoring-tools.js";
import { documentText } from "./document-text.js";
import { ReviewInputError, fileLineRangeSchema } from "./document.js";
import {
  instructionsQuerySchema,
  renderInstructions,
  scratchpadAvailable,
} from "./instructions.js";
import type { LocalReviewData } from "./local-data.js";
import {
  inspectQuerySchema,
  queryAnchor,
  readQuerySchemas,
} from "./read-schemas.js";
import {
  type ReviewRequestVia,
  reviewRequestOrigin,
} from "./request-origin.js";
import {
  type UncategorizedReport,
  coverageModeSchema,
  lensReport,
  progressUpdateSchema,
  reviewProgress,
  uncategorizedReport,
} from "./review-progress.js";
import {
  type ReviewStore,
  SCRATCHPAD_ID,
  type Snapshot,
  commandSchema,
  inspectSnapshot,
} from "./store.js";

export interface AuthoringCapabilities {
  desktopAvailable: boolean;
  softwareMapEnabled: boolean;
  /** Off, the host neither makes nor lists the scratchpad, and refuses its id. */
  scratchpadEnabled: boolean;
}

const SCRATCHPAD_DISABLED =
  "The scratchpad is off. Turn it on in Blackboard Desktop Settings.";

/**
 * What the host reports about reviews, for telemetry. `onReviewCreated` fires
 * again for a replayed create command; consumers dedupe by review id.
 */
export interface ReviewApiHooks {
  onReviewCreated?: (event: {
    reviewId: string;
    kind: "review" | "scratchpad";
    blocks: number;
    via: ReviewRequestVia;
    agentKind?: ReviewSessionAgent;
  }) => void;
}

/** A gateway forwarding from another machine; it gets no local paths. */
const remoteCaller = (context: Context) =>
  context.req.header(REVIEW_CLIENT_HEADER) === REVIEW_CLIENT_REMOTE;

/** Both hosts mount this behind their token authentication. */
export function createReviewApi(
  store: ReviewStore,
  data?: LocalReviewData,
  open?: (review: {
    reviewId: string;
    title: string;
  }) => Promise<{ softwareMapEnabled: boolean }>,
  capabilities: () =>
    | Omit<AuthoringCapabilities, "scratchpadEnabled">
    | Promise<Omit<AuthoringCapabilities, "scratchpadEnabled">> = () => ({
    desktopAvailable: Boolean(open),
    softwareMapEnabled: false,
  }),
  // Synchronous because the catalog is read inside watch callbacks. The host
  // keeps it current from its preferences file.
  scratchpadEnabled: () => boolean = () => false,
  /** Which server this is, for blackboard_status. */
  status: () => JsonObject = () => ({}),
  hooks: ReviewApiHooks = {},
) {
  const app = new Hono();
  app.onError((error, context) => {
    if (error instanceof HttpJsonError)
      return context.json({ error: error.message }, error.statusCode);

    if (error instanceof ReviewInputError)
      return context.json({ error: error.message }, error.status);

    // A readable message for agents and the canvas; issues stay for programs.
    if (error instanceof z.ZodError)
      return context.json(
        { error: z.prettifyError(error), issues: error.issues },
        400,
      );

    // Provider failures may contain local paths/subprocess output: the server
    // log gets the cause, the response only its kind. Desktop routes this
    // process's stderr to its main log.
    console.error(
      `[Review API] ${context.req.method} ${context.req.path} failed:`,
      error,
    );

    return context.json(
      {
        error: `Blackboard operation failed (${failureKind(error)}). The server logged the cause; Blackboard Desktop writes it to main.log in its logs folder.`,
      },
      500,
    );
  });

  if (data)
    app.use("*", async (context, next) => {
      if (context.req.method === "GET" && !context.req.query("version"))
        await store.refreshWorktrees();
      await next();
    });

  // The host that can show the scratchpad keeps it: Desktop, while the
  // preference is on. Headless servers never make one, and a pad made earlier
  // stays in the store while it is off.
  const ensureScratchpad = async (id?: string) => {
    if (open && scratchpadEnabled() && (!id || id === SCRATCHPAD_ID))
      await store.ensureScratchpad();
  };

  const refuseDisabledScratchpad = (id?: string) => {
    if (id === SCRATCHPAD_ID && !scratchpadEnabled())
      throw new ReviewInputError(SCRATCHPAD_DISABLED, 409);
  };

  const reviewGuard: MiddlewareHandler = async (context, next) => {
    refuseDisabledScratchpad(context.req.param("id"));
    await ensureScratchpad(context.req.param("id"));

    return next();
  };

  app.use("/:id", reviewGuard);
  app.use("/:id/*", reviewGuard);

  const readReview = (id: string, version?: number): Snapshot =>
    store.read(id, version);

  const catalog = (mode: "structural" | "textual" = "structural") => {
    const local = store.list(mode);

    return scratchpadEnabled()
      ? local
      : local.filter((summary) => summary.kind !== "scratchpad");
  };

  app.get("/", async (context) => {
    await ensureScratchpad();

    return context.json(
      catalog(coverageModeSchema.parse(context.req.query("mode"))),
    );
  });

  // Server-owned state only: asking the Desktop canvas would let a stalled
  // renderer block tool listing and the first instructions call.
  const instructionContext = async () => ({
    desktopAvailable: Boolean(open),
    scratchpadEnabled: scratchpadEnabled(),
  });

  app.get("/authoring", async (context) => {
    const instructions = await instructionContext();

    return context.json(authoringTools(scratchpadAvailable(instructions)));
  });
  app.get("/instructions", async (context) => {
    const { topic } = instructionsQuerySchema.parse(context.req.query());

    return context.json(
      await renderInstructions(topic, await instructionContext()),
    );
  });
  app.get("/:id/gitlab", (context) =>
    context.json(store.gitlab.read(context.req.param("id"))),
  );
  app.post("/:id/gitlab/:action", async (context) => {
    if (!data)
      throw new ReviewInputError("GitLab source service is unavailable.", 409);
    const id = context.req.param("id");

    const snapshot = store.read(id);
    const version = context.req.query("version");

    if (version !== undefined && Number(version) !== snapshot.version)
      throw new ReviewInputError(
        "Historical reviews cannot modify GitLab. Open the current review.",
        409,
      );

    if (!snapshot.origin?.gitlab)
      throw new ReviewInputError("This review has no GitLab MR.", 404);
    const action = context.req.param("action");

    if (action === "refresh")
      return context.json(await data.gitlab.refresh(id));
    const input = await readBoundedRequestJson(context.req.raw);

    if (action === "drafts")
      return context.json(
        await data.gitlab.save(id, gitLabSaveDraftSchema.parse(input)),
      );
    const draftInput = z.strictObject({ id: z.uuid() });

    if (action === "discard") {
      store.gitlab.discard(id, draftInput.parse(input).id);

      return context.json(store.gitlab.read(id));
    }

    if (action === "post")
      return context.json(
        await data.gitlab.post(
          id,
          z.strictObject({ id: z.uuid().optional() }).parse(input).id,
        ),
      );

    if (action === "resolve")
      return context.json(
        await data.gitlab.resolve(
          id,
          z.strictObject({ discussionId: z.string().min(1) }).parse(input)
            .discussionId,
        ),
      );

    if (action === "recover") {
      const recovery = z
        .strictObject({
          id: z.uuid(),
          verified: z.literal(true),
          posted: z.boolean(),
          noteId: z.number().int().positive().optional(),
        })
        .parse(input);

      return context.json(
        await data.gitlab.recover(
          id,
          recovery.id,
          recovery.posted,
          recovery.noteId,
        ),
      );
    }

    throw new ReviewInputError("Unknown GitLab action.", 404);
  });
  app.get("/:id/progress", async (context) => {
    if (!data) throw new ReviewInputError("Source data is unavailable.", 409);

    const query = readQuerySchemas.get
      .pick({ version: true })
      .extend({
        mode: coverageModeSchema,
        wait: z.enum(["false", "true"]).default("true"),
      })
      .parse(context.req.query());

    const snapshot = readReview(context.req.param("id"), query.version);

    const documentPins =
      query.wait === "false" && snapshot.pins
        ? (await data.resolveSource(snapshot)).pins
        : undefined;

    if (documentPins) {
      const state = data.coverageSnapshot(
        snapshot.reviewId,
        documentPins,
        query.mode,
      );

      if (state.pending)
        return context.json(
          await reviewProgress(
            store,
            data,
            snapshot,
            context.req.raw.signal,
            query.mode,
            state.comparison,
          ),
          202,
        );
    }

    return context.json(
      await reviewProgress(
        store,
        data,
        snapshot,
        context.req.raw.signal,
        query.mode,
      ),
    );
  });
  app.post("/:id/progress", async (context) => {
    if (!data) throw new ReviewInputError("Source data is unavailable.", 409);

    const input = progressUpdateSchema.parse(
      await readBoundedRequestJson(context.req.raw),
    );

    const id = context.req.param("id");

    const snapshot = store.read(id);

    const progress = await reviewProgress(
      store,
      data,
      snapshot,
      context.req.raw.signal,
      input.mode,
    );

    const files = input.files.map((update) => {
      const file = progress.files.find((file) => file.path === update.path);

      if (!file || file.fingerprint !== update.fingerprint)
        throw new ReviewInputError(
          "This file changed. Reload before marking it viewed.",
          409,
        );

      return {
        path: file.path,
        fingerprint: file.fingerprint,
        scope: scopedCoverage(file, update.sources),
      };
    });

    if (store.read(id).version !== snapshot.version)
      throw new ReviewInputError(
        "Review changed during this update. Try again.",
        409,
      );
    store.updateViewedCoverage(id, files, input.viewed);

    return context.json(
      await reviewProgress(
        store,
        data,
        store.read(id, input.version),
        context.req.raw.signal,
        input.mode,
      ),
    );
  });
  // A lens author's cheap read: the lenses as authored, what each resolves
  // to, and the changed lines no lens selects yet.
  app.get("/:id/lenses", async (context) => {
    if (!data) throw new ReviewInputError("Source data is unavailable.", 409);

    const snapshot = readReview(context.req.param("id"));

    return context.json({
      version: snapshot.version,
      ...lensReport(
        snapshot.lenses ?? [],
        await reviewProgress(store, data, snapshot, context.req.raw.signal),
      ),
    });
  });
  app.get("/status", async (context) =>
    context.json({
      ...status(),
      desktopAvailable: (await capabilities()).desktopAvailable,
    }),
  );

  app.get("/capabilities", async (context) =>
    context.json({
      ...(await capabilities()),
      scratchpadEnabled: scratchpadEnabled(),
    }),
  );

  app.get("/:id/activity", (context) => {
    const id = context.req.param("id");
    readReview(id);

    return context.json(store.activity.read(id));
  });

  // One route per agent tool; the path names the action.
  for (const [path, action] of [
    ["begin", "begin"],
    ["update", "renew"],
    ["end", "end"],
  ] as const)
    app.post(`/:id/activity/${path}`, async (context) => {
      const input = await readBoundedRequestJson(context.req.raw);
      const id = context.req.param("id");
      store.assertExists(id);

      return context.json(
        store.activity.update(
          id,
          isJsonObject(input) ? { ...input, action } : input,
        ),
      );
    });
  app.get("/watch", async (context) => {
    const query = context.req.query("subscriptions");

    if (query !== undefined) {
      let input: unknown;

      try {
        input = JSON.parse(query);
      } catch {
        throw new ReviewInputError("Invalid subscriptions.");
      }

      const subscriptions = z
        .array(
          z.strictObject({
            reviewId: z.string().min(1).nullable(),
            mode: coverageModeSchema,
          }),
        )
        .parse(input);

      // Only entries whose review (or the catalog) changed are re-read and re-sent.
      const dirty = new Set(subscriptions.keys());

      const mark = (id: string | null) => {
        let marked = false;

        subscriptions.forEach((item, index) => {
          if (item.reviewId === id) {
            dirty.add(index);
            marked = true;
          }
        });

        return marked;
      };

      return watch(
        () =>
          subscriptions.map(({ reviewId, mode }, index) => {
            if (!dirty.delete(index)) return null;

            try {
              return {
                value:
                  reviewId === null
                    ? catalog(mode)
                    : {
                        ...readReview(reviewId),
                        activity: store.activity.read(reviewId),
                        coverageRevision: data?.coverageRevision ?? 0,
                      },
              };
            } catch (error) {
              return {
                error:
                  error instanceof ReviewInputError
                    ? error.message
                    : "Could not read review.",
              };
            }
          }),
        (notify) => {
          const stopRefresh = store.watchWorktrees();

          const stops = [
            stopRefresh,
            data?.subscribeCoverage(() => {
              subscriptions.forEach((item, index) => {
                if (item.reviewId !== null) dirty.add(index);
              });

              // Coverage never changes the catalog; don't send an all-null line.
              if (dirty.size > 0) notify();
            }) ?? (() => {}),
            store.subscribe((result) => {
              if (mark(result.reviewId)) notify();
            }),
            store.activity.subscribe((id) => {
              if (mark(id)) notify();
            }),
            store.activity.subscribeWorking(() => {
              if (mark(null)) notify();
            }),
            store.subscribeCatalog(() => {
              if (mark(null)) notify();
            }),
          ];

          return () => stops.forEach((stop) => stop());
        },
        // A missing review is an {error} entry here, never a 404.
        () => {},
      );
    }

    await ensureScratchpad();

    return watch(
      () => catalog(coverageModeSchema.parse(context.req.query("mode"))),
      (notify) => {
        const local = store.subscribeCatalog(notify);
        const activity = store.activity.subscribeWorking(notify);

        return () => {
          local();
          activity();
        };
      },
    );
  });

  /** Show a review in Desktop and start preparing its pinned checkouts. */
  const openReview = async (review: Snapshot) => {
    if (!open) throw new ReviewInputError("The desktop is not connected.", 409);

    const settings = await open({
      reviewId: review.reviewId,
      title: review.title,
    });

    let environmentIssues: { side?: string; message: string }[] | undefined;

    try {
      if (review.target?.kind === "commits" && review.pins)
        void data?.workspaces
          .open(review.reviewId, review.pins)
          .catch(() => {});
      environmentIssues = data?.currentEnvironmentIssues(review);
    } catch (error) {
      environmentIssues = [
        {
          message: `Could not check language checkouts: ${errorMessage(error)}. Recheck with review_environment.`,
        },
      ];
    }

    return {
      ...settings,
      environmentIssues: environmentIssues?.length
        ? environmentIssues
        : undefined,
    };
  };

  /**
   * A created or returned review is shown where Desktop can, unless the author asked
   * not to. The review is already saved, so a failed open is reported, not thrown.
   */
  const openCreated = async (reviewId: string) => {
    try {
      if (!open || !(await capabilities()).desktopAvailable)
        return { opened: false };

      return { opened: true, ...(await openReview(store.read(reviewId))) };
    } catch (error) {
      return {
        opened: false,
        openError: `${errorMessage(error)} Retry with review_open.`,
      };
    }
  };

  app.post("/:id/open", async (context) => {
    const id = context.req.param("id");

    return context.json({ ok: true, ...(await openReview(readReview(id))) });
  });
  app.get("/:id/watch", (context) => {
    const id = context.req.param("id");

    // Activity changes every renewal; reload the document only when it changed.
    let document: Snapshot | undefined;

    return watch(
      () => ({
        ...(document ??= readReview(id)),
        activity: store.activity.read(id),
      }),
      (notify) => {
        const stopRefresh = store.watchWorktrees();

        const stopDocument = store.subscribe((result) => {
          if (result.reviewId === id) {
            document = undefined;
            notify();
          }
        });

        const stopActivity = store.activity.subscribe((changed) => {
          if (changed === id) notify();
        });

        return () => {
          stopRefresh();
          stopDocument();
          stopActivity();
        };
      },
    );
  });

  if (data) {
    app.post("/:id/navigator", async (context) => {
      if (remoteCaller(context))
        throw new ReviewInputError(
          "Source windows are not available for a review on another machine.",
          409,
        );

      const input = readQuerySchemas.file
        .extend({
          side: z.enum(["base", "head"]).default("head"),
          file: z.string().min(1).optional(),
          empty: z.literal("true").optional(),
        })
        .parse(context.req.query());

      return context.json(
        await data.navigatorWorkspace(
          readReview(context.req.param("id"), input.version),
          {
            ...input,
            empty: input.empty === "true",
            anchor: queryAnchor(input),
          },
        ),
      );
    });
    app.get("/:id/tree", async (context) => {
      const input = readQuerySchemas.tree.parse(context.req.query());

      const { pins } = await data.resolveSource(
        readReview(context.req.param("id"), input.version),
        input.commit,
        queryAnchor(input),
      );

      return context.json(await data!.tree(pins, input.side, input.path));
    });
    app.get("/:id/maps/:resourceId", async (context) => {
      const query = readQuerySchemas.maps.parse(context.req.query());
      const id = context.req.param("id");

      return context.json(
        await data.map(
          await data.sourcePins(readReview(id, query.version)),
          z.string().parse(context.req.param("resourceId")),
        ),
      );
    });
    app.post("/repositories", async (context) => {
      const input = z
        .strictObject({ path: z.string().min(1) })
        .parse(await readBoundedRequestJson(context.req.raw));

      return context.json(await data!.register(input.path));
    });
    app.post("/pins", async (context) => {
      const input = z
        .strictObject({
          repositoryId: z.string(),
          base: z.string(),
          head: z.string(),
        })
        .parse(await readBoundedRequestJson(context.req.raw));

      return context.json(
        await data!.resolvePins(input.repositoryId, input.base, input.head),
      );
    });
    app.post("/resources", async (context) =>
      context.json(
        await data!.upload(
          await readBoundedRequestJson(context.req.raw, 8 * 1024 * 1024),
        ),
      ),
    );
    app.get("/:id/resources/:resourceId", async (context) => {
      const id = context.req.param("id");
      const snapshot = readReview(id);

      const resource = store.resource(
        z.string().parse(context.req.param("resourceId")),
      );

      // A document with pins serves only its repository's resources.
      if (snapshot.pins && resource.repositoryId !== snapshot.pins.repositoryId)
        throw new ReviewInputError("Resource is outside this repository.", 404);

      return new Response(Buffer.from(resource.data), {
        headers: {
          "content-type": resource.mimeType,
          "x-content-type-options": "nosniff",
        },
      });
    });
    app.post("/:id/source", async (context) => {
      const input = z
        .strictObject({
          version: z.number().int().nonnegative().optional(),
          source: fileLineRangeSchema,
          commit: z.string().min(1).optional(),
        })
        .parse(await readBoundedRequestJson(context.req.raw));

      const { pins } = await data.resolveSource(
        readReview(context.req.param("id"), input.version),
        input.commit,
        input.source.pins,
      );

      return context.json(await data.quote(pins, input.source));
    });
    app.get("/:id/language-context", async (context) => {
      const input = readQuerySchemas.maps
        .extend({
          side: z.enum(["base", "head"]).default("head"),
          commit: z.string().optional(),
          repositoryId: z.string().optional(),
          head: z.string().optional(),
          base: z.string().optional(),
        })
        .parse(context.req.query());

      const snapshot = readReview(context.req.param("id"), input.version);

      const environment = await data.languageEnvironment(
        snapshot,
        input.side,
        input.commit,
        false,
        queryAnchor(input),
      );

      return context.json(
        remoteCaller(context)
          ? {
              // A live checkout's identity names its path; keep only its equality.
              identity: createHash("sha256")
                .update(environment.identity)
                .digest("hex"),
              // An acquisition error can quote local paths.
              ...(environment.issue && {
                issue:
                  "The checkout for language features is not available on the remote machine.",
              }),
            }
          : environment,
      );
    });
    app.post("/:id/environment", async (context) => {
      const input = z
        .strictObject({ retry: z.boolean().optional() })
        .parse(await readBoundedRequestJson(context.req.raw));

      return context.json({
        issues: await data.environmentIssues(
          readReview(context.req.param("id")),
          input.retry,
        ),
      });
    });
    app.post("/workspace-cleanup", async (context) => {
      const input = z
        .strictObject({ workspaceId: z.string().min(1).optional() })
        .parse(await readBoundedRequestJson(context.req.raw));

      if (input.workspaceId)
        await data.workspaces.retryCleanup(input.workspaceId);

      return context.json({ failures: data.workspaces.failures() });
    });
    app.get("/:id/workspaces", (context) => {
      readReview(context.req.param("id"));

      return context.json(data.workspaces.list(context.req.param("id")));
    });
    app.post("/:id/workspaces/:workspaceId/retry", async (context) => {
      return context.json(
        await data.workspaces.retry(
          context.req.param("id"),
          context.req.param("workspaceId"),
        ),
      );
    });
    app.get("/:id/file", async (context) => {
      // Browsing can describe binaries; authoring reads still require text.
      const input = readQuerySchemas.file
        .extend({ binary: z.literal("describe").optional() })
        .parse(context.req.query());

      const id = context.req.param("id");

      const anchor = queryAnchor(input);

      const { snapshot, pins } = await data.resolveSource(
        readReview(id, input.version),
        input.commit,
        anchor,
      );

      const file = await data.file(
        pins,
        input.side,
        input.file,
        input.binary === "describe",
      );

      if (file.text.includes("\0")) {
        return context.json({
          binary: true,
          file: file.file,
          side: file.side,
          commit: file.commit,
        });
      }

      const local =
        !remoteCaller(context) &&
        !input.commit &&
        !anchor &&
        input.side === "head" &&
        snapshot.target?.kind === "worktree"
          ? await data.liveFile(pins.repositoryId, input.file, file.text)
          : undefined;

      return context.json({ ...file, ...local });
    });
    app.get("/:id/structural-diff", async (context) => {
      const input = readQuerySchemas.structuralDiff.parse(context.req.query());
      const id = context.req.param("id");

      const { pins } = await data.resolveSource(
        readReview(id, input.version),
        input.commit,
        queryAnchor(input),
      );

      const abort = new AbortController();
      const encoder = new TextEncoder();

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: ReviewStructuralDiffEvent) => {
            if (!abort.signal.aborted)
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          };

          try {
            for await (const event of data.structuralChanges({
              reviewId: id,
              pins,
              signal: AbortSignal.any([context.req.raw.signal, abort.signal]),
              file: input.file,
            }))
              send(event);
          } catch (error) {
            send({
              type: "error",
              message: error instanceof Error ? error.message : String(error),
            });
          } finally {
            if (!abort.signal.aborted) controller.close();
          }
        },
        cancel() {
          abort.abort();
        },
      });

      return new Response(stream, {
        headers: {
          "content-type": "application/x-ndjson",
          "cache-control": "no-store",
        },
      });
    });
    app.get("/:id/diff", async (context) => {
      const query = context.req.query();
      const paths = context.req.queries("paths");
      const input = readQuerySchemas.diff.parse({ ...query, paths });

      if (input.format === "raw" && (input.file === undefined || paths))
        throw new ReviewInputError(
          "raw requires one file and cannot be combined with paths.",
        );

      if (
        input.file !== undefined &&
        input.format !== "raw" &&
        (paths || "format" in query)
      )
        throw new ReviewInputError(
          'file cannot be combined with paths or format; use paths:["…"], format:"patch".',
        );

      const { pins } = await data.resolveSource(
        readReview(context.req.param("id"), input.version),
        input.commit,
        queryAnchor(input),
      );

      if (input.format === "raw") {
        const patch = await data.rawFilePatch(pins, input.file!, input.context);

        if (Buffer.byteLength(patch, "utf8") > input.maxBytes)
          throw new ReviewInputError(
            `Patch exceeds the ${input.maxBytes}-byte display limit. Open the source file to inspect it.`,
            409,
          );

        return context.text(patch, 200, {
          "content-type": "text/plain; charset=utf-8",
        });
      }

      if (input.format === "files" && input.file === undefined)
        return context.json(await data.changedFiles(pins, input.paths));

      return context.text(
        await data.patches(pins, {
          paths: input.file === undefined ? input.paths : [input.file],
          contextLines: input.context,
          maxBytes: input.maxBytes,
        }),
        200,
        { "content-type": "text/plain; charset=utf-8" },
      );
    });
    app.get("/:id/commits", async (context) => {
      const input = readQuerySchemas.commits.parse(context.req.query());

      return context.json(
        await data.commits(
          (
            await data.resolveSource(
              readReview(context.req.param("id"), input.version),
            )
          ).pins,
        ),
      );
    });
  }

  app.post("/:id/copy-context", async (context) => {
    const query = readQuerySchemas.get
      .pick({ version: true })
      .extend({ mode: coverageModeSchema })
      .parse(context.req.query());

    const selection = AgentSelectionSchema.parse(
      await readBoundedRequestJson(context.req.raw),
    );

    return context.json({
      text: await selectionContext(
        context.req.param("id"),
        selection,
        query.version,
      ),
    });
  });

  /** The Markdown copied for an external agent to read a selection. */
  async function selectionContext(
    reviewId: string,
    selection: AgentSelection,
    version?: number,
  ) {
    if (selection.apiSource && selection.apiSource.reviewId !== reviewId)
      throw new ReviewInputError("Selection belongs to another review.");

    const snapshot = readReview(
      reviewId,
      selection.apiSource?.version ?? version,
    );

    const target = selection.target;
    let excerpt = "";

    if (target.kind === "code" && !selection.selectedDiff) {
      if (!data) throw new ReviewInputError("Source data is unavailable.", 409);

      const source = await data.quote(
        (
          await data.resolveSource(
            snapshot,
            selection.apiSource?.commit,
            selection.apiSource?.pins,
          )
        ).pins,
        {
          side: target.side,
          file: target.path,
          fromLine: target.startLine,
          toLine: target.endLine,
        },
      );

      excerpt =
        `## ${target.side}: ${target.path}:${target.startLine}-${target.endLine} (${source.commit})\n` +
        source.text
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n");
    }

    const diff = selection.selectedDiff;

    const text = selectionMarkdown(
      selection,
      excerpt,
      diff
        ? { base: `a/${diff.oldPath}`, head: `b/${diff.newPath}` }
        : undefined,
    );

    return [
      `Selected ${target.kind === "text" ? "text" : "code"} from Blackboard: ${snapshot.title}`,
      `Session ID: ${snapshot.reviewId}`,
      `Version: ${snapshot.version}`,
      ...(selection.apiSource?.commit
        ? [`Selected commit: ${selection.apiSource.commit}`]
        : []),
      ...(selection.apiSource?.pins
        ? [
            `Selected repository ID: ${selection.apiSource.pins.repositoryId}`,
            ...(selection.apiSource.pins.base
              ? [`Selected base: ${selection.apiSource.pins.base}`]
              : []),
            `Selected head: ${selection.apiSource.pins.head}`,
          ]
        : []),
      ...(snapshot.pins
        ? [
            `Repository ID: ${snapshot.pins.repositoryId}`,
            `Session base: ${snapshot.pins.base}`,
            `Session head: ${snapshot.pins.head}`,
          ]
        : []),
      `Read this version with session_get({"sessionId":"${snapshot.reviewId}","version":${snapshot.version},"full":true}).`,
      "",
      text,
      "",
      "",
    ].join("\n");
  }

  app.get("/:id/stack", async (context) => {
    const query = readQuerySchemas.get.parse(context.req.query());
    const id = context.req.param("id");
    const snapshot = readReview(id, query.version);

    if (!snapshot.pins) return context.json({ layers: [] });
    const repositoryId = snapshot.pins.repositoryId;

    const repoKey = (review: Pick<Snapshot, "origin" | "pins">) =>
      review.origin?.pullRequestUrl?.replace(/\/pull\/\d+.*$/, "") ??
      review.pins?.repositoryId ??
      "";

    const layers = await resolveReviewStackLayers(
      {
        pullRequestUrl: snapshot.origin?.pullRequestUrl,
      },
      store.list().map((review) => ({
        uuid: review.reviewId,
        title: review.title,
        repoKey: repoKey(review),
        pullRequestNumber: review.origin?.pullRequestNumber,
        presentedDocumentRevision: String(review.version),
      })),
    );

    return context.json({ layers });
  });

  app.get("/:id/history", (context) =>
    context.json(store.history(context.req.param("id"))),
  );
  app.get("/:id/inspect", (context) => {
    const query = inspectQuerySchema.parse(context.req.query());
    const id = context.req.param("id");
    const snapshot = readReview(id, query.version);

    return context.json(
      query.format === "text"
        ? documentText(snapshot, query.targetId, Boolean(query.full))
        : query.targetId !== undefined
          ? inspectSnapshot(snapshot, query.targetId)
          : query.full
            ? snapshot
            : inspectSnapshot(snapshot),
    );
  });
  app.get("/:id", async (context) => {
    const query = readQuerySchemas.get.parse(context.req.query());

    const snapshot = { ...readReview(context.req.param("id"), query.version) };

    if (data && query.full) {
      try {
        const pins = await data.sourcePins(snapshot);

        if (pins) snapshot.pins = pins;
      } catch (error) {
        if (!(error instanceof ReviewInputError) || error.status !== 404)
          throw error;
        snapshot.sourceUnavailable = true;
      }
    }

    return context.json(
      query.full ? snapshot : inspectSnapshot(snapshot, query.targetId),
    );
  });

  /** After a lens write: the changed lines still uncategorized at that
   * version, so the author can fill the gaps. A comparison that cannot be
   * read leaves a warning instead of failing the saved write. */
  const lensGaps = async (
    reviewId: string,
    version: number,
    request: Request,
  ): Promise<{ uncategorized?: UncategorizedReport; warnings?: string[] }> => {
    if (!data) return {};

    try {
      return {
        uncategorized: uncategorizedReport(
          await reviewProgress(
            store,
            data,
            store.read(reviewId, version),
            request.signal,
          ),
        ),
      };
    } catch (error) {
      return {
        warnings: [
          `Uncategorized changes are unavailable: ${errorMessage(error)}`,
        ],
      };
    }
  };

  app.post("/commands", async (context) => {
    const { command: request, open: requestedOpen } = takeCreateOpen(
      await readBoundedRequestJson(context.req.raw),
    );

    const input = commandSchema.parse(request);

    const reviewId =
      "reviewId" in input.operation ? input.operation.reviewId : undefined;

    refuseDisabledScratchpad(reviewId);
    await ensureScratchpad(reviewId);

    if (
      input.operation.type === "create" &&
      input.operation.kind === "scratchpad"
    )
      refuseDisabledScratchpad(SCRATCHPAD_ID);

    const result = await store.execute(input);

    if (input.operation.type === "lens_edit") {
      const gaps = await lensGaps(
        result.reviewId,
        result.version,
        context.req.raw,
      );

      return context.json({
        ...result,
        ...gaps,
        ...(gaps.warnings && {
          warnings: [...(result.warnings ?? []), ...gaps.warnings],
        }),
      });
    }

    if (input.operation.type !== "create") return context.json(result);

    // False when an existing review for the same PR came back. A replayed
    // command returns its first receipt, so this can repeat for one review.
    if (result.created !== false)
      hooks.onReviewCreated?.({
        reviewId: result.reviewId,
        kind: input.operation.kind === "scratchpad" ? "scratchpad" : "review",
        blocks: store.read(result.reviewId).document.length,
        ...reviewRequestOrigin(context.req.raw.headers),
      });

    return context.json({
      ...result,
      review: store.summary(result.reviewId),
      ...(requestedOpen === false
        ? { opened: false }
        : await openCreated(result.reviewId)),
    });
  });

  return app;
}

const systemErrorSchema = z.object({ code: z.string().regex(/^[A-Z0-9_]+$/) });

/** A system error code such as EACCES, else the error's class; never its message. */
function failureKind(error: Error): string {
  const system = systemErrorSchema.safeParse(error);

  return system.success ? system.data.code : error.name;
}

/**
 * `open` steers presentation, not the saved review, so it stays out of the
 * command and its receipt: a retry may choose differently. Anything else,
 * including `open` off create, is left for commandSchema to reject.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Request body boundary: commandSchema parses the result.
function takeCreateOpen(body: unknown) {
  const create = z
    .looseObject({
      operation: z.looseObject({
        type: z.literal("create"),
        open: z.boolean().optional(),
      }),
    })
    .safeParse(body);

  if (!create.success) return { command: body };
  const { open, ...operation } = create.data.operation;

  return { command: { ...create.data, operation }, open };
}

/** Send committed state, coalescing updates when the reader falls behind. */
function watch<T>(
  read: () => T,
  subscribe: (notify: () => void) => () => void,
  probe: () => void = read,
) {
  probe(); // Return a normal 404 before opening the response.
  let stop = () => {};

  let dirty = true;
  const encoder = new TextEncoder();

  const send = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (
      !dirty ||
      controller.desiredSize === null ||
      controller.desiredSize <= 0
    )
      return;

    try {
      const line = JSON.stringify(read()) + "\n";

      // enqueue can pull synchronously; clear first so it doesn't resend.
      dirty = false;
      controller.enqueue(encoder.encode(line));
    } catch (error) {
      // A review can be deleted while this stream is open. Do not throw into
      // the already-committed writer; close this reader and unsubscribe it.
      stop();
      controller.error(error);
    }
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stop = subscribe(() => {
        dirty = true;
        send(controller);
      });
      send(controller);
    },
    pull: send,
    cancel() {
      stop();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
    },
  });
}
