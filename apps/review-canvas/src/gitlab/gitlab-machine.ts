import {
  type GitLabDraft,
  type GitLabState,
  type GitLabTarget,
  gitLabDraftSchema,
  gitLabStateSchema,
} from "@chalk/review-contracts";
import {
  type ActorRefFrom,
  type SnapshotFrom,
  assertEvent,
  assign,
  fromPromise,
  setup,
} from "xstate";

export type GitLabAction =
  | "refresh"
  | "post"
  | "discard"
  | "resolve"
  | "recover";

export type GitLabActionInput = {
  id?: string;
  discussionId?: string;
  verified?: boolean;
  posted?: boolean;
  noteId?: number;
};

/** Local text of one draft; the single copy every editor of that draft shows. */
export interface GitLabEditor {
  text: string;
  target: GitLabTarget;
  version?: number;
  dirty: boolean;
  error?: string;
  /** Bumped per edit, so a save only marks clean the text it sent. */
  generation: number;
}

export type GitLabRequest = (
  endpoint: `/${string}`,
  body?: object,
) => Promise<unknown>;

interface GitLabContext {
  editable: boolean;
  state: GitLabState | null;
  editors: Record<string, GitLabEditor>;
  pending: { action: GitLabAction; input: GitLabActionInput } | null;
  error: string | null;
  /** The draft or discussion to focus. */
  selected: string | null;
}

export type GitLabEvent =
  /** Loads on the first one; later ones only update `editable`. */
  | { type: "load"; editable: boolean }
  | { type: "edit"; id: string; text: string }
  /** `id` names the new draft unless the thread already has a reply draft. */
  | { type: "compose"; id: string; target: GitLabTarget }
  | { type: "select"; id: string }
  | { type: "run"; action: GitLabAction; input?: GitLabActionInput };

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Errors from fetch and schema parsing are checked as Error instances here.
export const message = (error: unknown) =>
  error instanceof Error ? error.message : "GitLab operation failed.";

const isOpen = (draft: GitLabDraft) =>
  ["saved", "failed"].includes(draft.status);

export async function saveDraft(
  request: GitLabRequest,
  id: string,
  editor: GitLabEditor,
) {
  return gitLabDraftSchema.parse(
    await request("/gitlab/drafts", {
      id,
      text: editor.text,
      target: editor.target,
      ...(editor.version !== undefined && { version: editor.version }),
    }),
  );
}

/** Server state replaces local text only where nothing is waiting to be saved. */
function receive(context: GitLabContext, next: GitLabState) {
  const editors = { ...context.editors };

  for (const draft of next.drafts) {
    const editor = editors[draft.id];

    if (editor && !editor.dirty)
      editors[draft.id] = {
        text: draft.text,
        target: draft.target,
        version: draft.version,
        dirty: false,
        generation: editor.generation,
      };
  }

  return { state: next, editors };
}

const firstDirty = (context: GitLabContext) =>
  Object.entries(context.editors).find(([, editor]) => editor.dirty);

/** One save or request at a time. Editor text survives a failed save; actions wait for every draft to be saved. */
export function createGitLabMachine(request: GitLabRequest) {
  return setup({
    types: {
      // SAFETY: XState reads `context` only for type inference.
      context: {} as GitLabContext,
      // SAFETY: XState reads `events` only for type inference.
      events: {} as GitLabEvent,
    },
    actors: {
      load: fromPromise(async () =>
        gitLabStateSchema.parse(await request("/gitlab")),
      ),
      save: fromPromise(
        async ({ input: [id, editor] }: { input: [string, GitLabEditor] }) => {
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
        async ({
          input,
        }: {
          input: NonNullable<GitLabContext["pending"]>;
        }) =>
          gitLabStateSchema.parse(
            await request(`/gitlab/${input.action}`, input.input),
          ),
      ),
    },
    guards: {
      canStart: ({ context }) => context.editable && !context.pending,
      canEdit: ({ context, event }) => {
        assertEvent(event, "edit");
        const draft = context.state?.drafts.find((d) => d.id === event.id);

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
        const draft = context.state?.drafts.find((d) => d.id === event.id);
        const previous = context.editors[event.id];

        return {
          editors: {
            ...context.editors,
            [event.id]: {
              text: event.text,
              target: previous?.target ?? draft!.target,
              version: previous?.version ?? draft?.version,
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
            ? context.state?.drafts.find(
                (d) =>
                  d.target.kind === "reply" &&
                  d.target.discussionId === target.discussionId &&
                  isOpen(d),
              )
            : undefined;

        if (existing) return { selected: existing.id };

        return {
          selected: event.id,
          editors: {
            ...context.editors,
            [event.id]: { text: "", target, dirty: true, generation: 1 },
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
    id: "gitlab",
    initial: "unloaded",
    context: {
      editable: false,
      state: null,
      editors: {},
      pending: null,
      error: null,
      selected: null,
    },
    on: {
      load: { actions: assign({ editable: ({ event }) => event.editable }) },
      // Outside idle, edits wait for the save in flight; the flush after it picks them up.
      edit: { guard: "canEdit", actions: "edit" },
      compose: { guard: "canStart", actions: "compose" },
      run: { guard: "canStart", actions: "run" },
      select: { actions: assign({ selected: ({ event }) => event.id }) },
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
              guard: ({ context }) => context.editable,
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
          debouncing: { after: { 400: "#gitlab.flush" } },
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
        },
      },
      flush: {
        always: [
          { guard: ({ context }) => !!firstDirty(context), target: "saving" },
          { guard: ({ context }) => !!context.pending, target: "requesting" },
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
                  draft: GitLabDraft;
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
                        drafts: [
                          ...context.state.drafts.filter((d) => d.id !== id),
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
      requesting: {
        invoke: {
          src: "request",
          input: ({ context }) => context.pending!,
          onDone: {
            target: "idle",
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

export type GitLabSnapshot = SnapshotFrom<
  ActorRefFrom<ReturnType<typeof createGitLabMachine>>
>;
