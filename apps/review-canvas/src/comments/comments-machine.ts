import {
  type CommentTarget,
  type CommentsState,
  type ReviewComment,
  commentsStateSchema,
  reviewCommentSchema,
} from "@chalk/review-contracts";
import {
  type ActorRefFrom,
  type SnapshotFrom,
  assertEvent,
  assign,
  fromPromise,
  setup,
} from "xstate";

export type CommentAction =
  | "refresh"
  | "post"
  | "discard"
  | "resolve"
  | "recover";

export type CommentActionInput = {
  id?: string;
  discussionId?: string;
  verified?: boolean;
  posted?: boolean;
  noteId?: number;
};

/** Local text of one draft; the single copy every editor of that draft shows. */
export interface CommentDraft {
  text: string;
  target: CommentTarget;
  version?: number;
  createdAt?: string;
  dirty: boolean;
  error?: string;
  /** Bumped per edit, so a save only marks clean the text it sent. */
  generation: number;
}

export type CommentsRequest = (
  endpoint: `/${string}`,
  body?: object,
) => Promise<unknown>;

interface CommentsContext {
  editable: boolean;
  state: CommentsState | null;
  editors: Record<string, CommentDraft>;
  pending: { action: CommentAction; input: CommentActionInput } | null;
  error: string | null;
  /** The draft or discussion to focus. */
  selected: string | null;
  /** The server changed since the last load; reload once nothing is in flight. */
  stale: boolean;
}

export type CommentsEvent =
  /** Loads on the first one; later ones only update `editable`. */
  | { type: "load"; editable: boolean }
  | { type: "edit"; id: string; text: string }
  /** `id` names the new draft unless the thread already has a reply draft. */
  | { type: "compose"; id: string; target: CommentTarget }
  | { type: "select"; id: string }
  | { type: "run"; action: CommentAction; input?: CommentActionInput }
  /** Someone, such as an agent, changed the comments. */
  | { type: "sync" };

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Errors from fetch and schema parsing are checked as Error instances here.
export const message = (error: unknown) =>
  error instanceof Error ? error.message : "Comment operation failed.";

const isOpen = (draft: ReviewComment) =>
  ["saved", "failed"].includes(draft.status);

export async function saveDraft(
  request: CommentsRequest,
  id: string,
  editor: CommentDraft,
) {
  return reviewCommentSchema.parse(
    await request("/comments/save", {
      id,
      text: editor.text,
      target: editor.target,
      ...(editor.version !== undefined && { version: editor.version }),
    }),
  );
}

/** Server state replaces local text only where nothing is waiting to be saved. */
function receive(context: CommentsContext, next: CommentsState) {
  const editors = { ...context.editors };

  for (const draft of next.comments) {
    const editor = editors[draft.id];

    if (editor && !editor.dirty)
      editors[draft.id] = {
        text: draft.text,
        target: draft.target,
        version: draft.version,
        createdAt: draft.createdAt,
        dirty: false,
        generation: editor.generation,
      };
  }

  // A saved comment discarded elsewhere leaves with its clean editor.
  for (const [id, editor] of Object.entries(editors))
    if (
      !editor.dirty &&
      editor.version !== undefined &&
      !next.comments.some((c) => c.id === id)
    )
      delete editors[id];

  return { state: next, editors };
}

const firstDirty = (context: CommentsContext) =>
  Object.entries(context.editors).find(([, editor]) => editor.dirty);

/** One save or request at a time. Editor text survives a failed save; actions wait for every draft to be saved. */
export function createCommentsMachine(request: CommentsRequest) {
  return setup({
    types: {
      // SAFETY: XState reads `context` only for type inference.
      context: {} as CommentsContext,
      // SAFETY: XState reads `events` only for type inference.
      events: {} as CommentsEvent,
    },
    actors: {
      load: fromPromise(async () =>
        commentsStateSchema.parse(await request("/comments")),
      ),
      save: fromPromise(
        async ({ input: [id, editor] }: { input: [string, CommentDraft] }) => {
          try {
            return {
              id,
              generation: editor.generation,
              draft: await saveDraft(request, id, editor),
            };
          } catch (error) {
            return { id, error: message(error) };
          }
        },
      ),
      request: fromPromise(
        async ({ input }: { input: NonNullable<CommentsContext["pending"]> }) =>
          commentsStateSchema.parse(
            await request(
              input.action === "discard"
                ? "/comments/discard"
                : `/gitlab/${input.action}`,
              input.input,
            ),
          ),
      ),
    },
    guards: {
      canStart: ({ context }) => context.editable && !context.pending,
      canEdit: ({ context, event }) => {
        assertEvent(event, "edit");
        const draft = context.state?.comments.find((d) => d.id === event.id);

        return (
          context.editable &&
          !context.pending &&
          (draft ? isOpen(draft) : !!context.editors[event.id])
        );
      },
    },
    actions: {
      edit: assign(({ context, event }) => {
        assertEvent(event, "edit");
        const draft = context.state?.comments.find((d) => d.id === event.id);
        const previous = context.editors[event.id];

        return {
          editors: {
            ...context.editors,
            [event.id]: {
              text: event.text,
              target: previous?.target ?? draft!.target,
              version: previous?.version ?? draft?.version,
              createdAt: previous?.createdAt ?? draft?.createdAt,
              dirty: true,
              generation: (previous?.generation ?? 0) + 1,
            },
          },
        };
      }),
      compose: assign(({ context, event }) => {
        assertEvent(event, "compose");
        const { target } = event;

        const existing =
          target.kind === "reply"
            ? (Object.entries(context.editors).find(
                ([id, editor]) =>
                  editor.target.kind === "reply" &&
                  editor.target.discussionId === target.discussionId &&
                  !context.state?.comments.some(
                    (d) => d.id === id && !isOpen(d),
                  ),
              )?.[0] ??
              context.state?.comments.find(
                (d) =>
                  d.target.kind === "reply" &&
                  d.target.discussionId === target.discussionId &&
                  isOpen(d),
              )?.id)
            : undefined;

        if (existing) return { selected: existing };

        return {
          selected: event.id,
          editors: {
            ...context.editors,
            [event.id]: {
              text: "",
              target,
              dirty: true,
              generation: 1,
              createdAt: new Date().toISOString(),
            },
          },
        };
      }),
      run: assign(({ event }) => {
        assertEvent(event, "run");

        return {
          pending: { action: event.action, input: event.input ?? {} },
          error: null,
        };
      }),
    },
  }).createMachine({
    id: "comments",
    initial: "unloaded",
    context: {
      editable: false,
      state: null,
      editors: {},
      pending: null,
      error: null,
      selected: null,
      stale: false,
    },
    on: {
      load: { actions: assign({ editable: ({ event }) => event.editable }) },
      // Outside idle, edits wait for the save in flight; the flush after it picks them up.
      edit: { guard: "canEdit", actions: "edit" },
      compose: { guard: "canStart", actions: "compose" },
      run: { guard: "canStart", actions: "run" },
      select: { actions: assign({ selected: ({ event }) => event.id }) },
      sync: { actions: assign({ stale: true }) },
    },
    states: {
      unloaded: {
        on: {
          load: {
            target: "loading",
            actions: assign(({ event }) => ({
              editable: event.editable,
              pending: { action: "refresh" as const, input: {} },
            })),
          },
        },
      },
      loading: {
        invoke: {
          src: "load",
          onDone: [
            // Show the stored state first, then refresh it from GitLab.
            {
              guard: ({ context, event }) =>
                context.editable && !!event.output.gitlab,
              target: "requesting",
              actions: assign(({ context, event }) =>
                receive(context, event.output),
              ),
            },
            {
              target: "idle",
              actions: assign(({ context, event }) => ({
                ...receive(context, event.output),
                pending: null,
              })),
            },
          ],
          onError: {
            target: "idle",
            actions: assign(({ event }) => ({
              error: message(event.error),
              pending: null,
            })),
          },
        },
      },
      idle: {
        initial: "waiting",
        states: {
          waiting: {},
          debouncing: { after: { 400: "#comments.flush" } },
        },
        on: {
          edit: {
            guard: "canEdit",
            actions: "edit",
            target: ".debouncing",
            reenter: true,
          },
          compose: {
            guard: "canStart",
            actions: "compose",
            target: ".debouncing",
            reenter: true,
          },
          run: { guard: "canStart", actions: "run", target: "flush" },
          sync: { actions: assign({ stale: true }), target: "flush" },
        },
      },
      flush: {
        always: [
          { guard: ({ context }) => !!firstDirty(context), target: "saving" },
          { guard: ({ context }) => !!context.pending, target: "requesting" },
          { guard: ({ context }) => context.stale, target: "syncing" },
          { target: "idle" },
        ],
      },
      saving: {
        invoke: {
          src: "save",
          input: ({ context }) => firstDirty(context)!,
          onDone: [
            {
              guard: ({ event }) => "error" in event.output,
              target: "idle",
              actions: assign(({ context, event }) => {
                const { id, error } = event.output as {
                  id: string;
                  error: string;
                };

                const editor = context.editors[id];

                return {
                  editors: editor
                    ? { ...context.editors, [id]: { ...editor, error } }
                    : context.editors,
                  // An action waiting on this save fails with it.
                  ...(context.pending && { error, pending: null }),
                };
              }),
            },
            {
              target: "flush",
              actions: assign(({ context, event }) => {
                const { id, generation, draft } = event.output as {
                  id: string;
                  generation: number;
                  draft: ReviewComment;
                };

                const latest = context.editors[id];

                const editors = latest
                  ? {
                      ...context.editors,
                      [id]: {
                        ...latest,
                        version: draft.version,
                        error: undefined,
                        ...(latest.generation === generation && {
                          target: draft.target,
                          dirty: false,
                        }),
                      },
                    }
                  : context.editors;

                return context.state
                  ? receive(
                      { ...context, editors },
                      {
                        ...context.state,
                        comments: [
                          ...context.state.comments.filter((d) => d.id !== id),
                          draft,
                        ],
                      },
                    )
                  : { editors };
              }),
            },
          ],
        },
      },
      syncing: {
        invoke: {
          src: "load",
          onDone: {
            target: "flush",
            actions: assign(({ context, event }) => ({
              ...receive(context, event.output),
              stale: false,
            })),
          },
          onError: {
            target: "idle",
            actions: assign(({ event }) => ({
              error: message(event.error),
              stale: false,
            })),
          },
        },
      },
      requesting: {
        invoke: {
          src: "request",
          input: ({ context }) => context.pending!,
          onDone: {
            target: "flush",
            actions: assign(({ context, event }) => {
              const editors = { ...context.editors };
              const { action, input } = context.pending!;

              if (action === "discard" && input.id !== undefined)
                delete editors[input.id];

              return {
                ...receive({ ...context, editors }, event.output),
                pending: null,
              };
            }),
          },
          onError: {
            target: "idle",
            actions: assign(({ event }) => ({
              error: message(event.error),
              pending: null,
            })),
          },
        },
      },
    },
  });
}

export type CommentsSnapshot = SnapshotFrom<
  ActorRefFrom<ReturnType<typeof createCommentsMachine>>
>;
