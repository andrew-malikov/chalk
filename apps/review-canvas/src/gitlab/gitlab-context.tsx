import { useReviewSession } from "@canvas/host/review-session";
import { useOptionalReviewPanelStore } from "@canvas/review/review-panel";
import {
  type GitLabDiscussion,
  type GitLabDraft,
  type GitLabState,
  type GitLabTarget,
  gitLabDraftSchema,
  gitLabSaveDraftSchema,
  gitLabStateSchema,
} from "@chalk/review-contracts";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";

type ActionInput = {
  id?: string;
  discussionId?: string;
  verified?: boolean;
  posted?: boolean;
  noteId?: number;
};

interface Editor {
  text: string;
  target: GitLabTarget;
  version?: number;
  dirty: boolean;
  error?: string;
  generation: number;
}

interface GitLabContextValue {
  state: GitLabState | null;
  editors: Record<string, Editor>;
  editable: boolean;
  busy: boolean;
  pending: {
    action: "refresh" | "post" | "discard" | "resolve" | "recover";
    input: ActionInput;
  } | null;
  error: string | null;
  open: boolean;
  selected: string | null;
  toggle(): void;
  edit(id: string, text: string): void;
  compose(target: GitLabTarget, placement?: "inline" | "panel"): void;
  select(discussion: GitLabDiscussion): void;
  run(
    action: "refresh" | "post" | "discard" | "resolve" | "recover",
    input?: ActionInput,
  ): Promise<void>;
  reveal: {
    file: string;
    side: "base" | "head";
    from: number;
    to: number;
    nonce: number;
  } | null;
}

const Context = createContext<GitLabContextValue | null>(null);

export function useGitLab() {
  return useContext(Context);
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Errors from fetch and schema parsing are checked as Error instances here.
const message = (error: unknown) =>
  error instanceof Error ? error.message : "GitLab operation failed.";

/** One save queue per review. Editor text survives a failed save; publishing waits for durable revisions. */
export function GitLabProvider({ children }: { children: ReactNode }) {
  const session = useReviewSession();
  const panels = useOptionalReviewPanelStore();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const enabled = !!session.review?.gitlab;

  const editable = enabled && session.review?.historicalRevision === null;

  const [state, setState] = useState<GitLabState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<GitLabContextValue["pending"]>(null);
  const pendingRef = useRef(pending);
  const busy = pending !== null;
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reveal, setReveal] = useState<GitLabContextValue["reveal"]>(null);
  const [editors, setEditors] = useState<Record<string, Editor>>({});
  const editorRef = useRef(editors);
  editorRef.current = editors;
  const queue = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const loaded = useRef(false);

  const syncEditors = () => {
    if (mounted.current) setEditors({ ...editorRef.current });
  };

  const receive = (next: GitLabState) => {
    stateRef.current = next;

    for (const draft of next.drafts) {
      const editor = editorRef.current[draft.id];

      if (editor && !editor.dirty)
        editorRef.current[draft.id] = {
          text: draft.text,
          target: draft.target,
          version: draft.version,
          dirty: false,
          generation: editor.generation,
        };
    }

    if (mounted.current) {
      setState(next);
      syncEditors();
    }
  };

  const request = async (
    endpoint: `/${string}`,
    input?: ActionInput | z.infer<typeof gitLabSaveDraftSchema>,
  ) => {
    const response = await sessionRef.current.fetch(
      endpoint,
      input === undefined
        ? undefined
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
    );

    const value: unknown = await response.json();

    if (!response.ok)
      throw new Error(
        z.object({ error: z.string() }).safeParse(value).data?.error ??
          `GitLab request failed (${response.status}).`,
      );

    return value;
  };

  const serialize = (operation: () => Promise<void>) => {
    const next = queue.current.then(operation);
    queue.current = next.catch(() => {});

    return next;
  };

  const flush = async () => {
    clearTimeout(timer.current);

    for (const [id, editor] of Object.entries(editorRef.current)) {
      if (!editor.dirty) continue;
      const generation = editor.generation;

      try {
        const draft = gitLabDraftSchema.parse(
          await request("/gitlab/drafts", {
            id,
            text: editor.text,
            target: editor.target,
            ...(editor.version !== undefined && { version: editor.version }),
          }),
        );

        const latest = editorRef.current[id];

        if (latest) {
          latest.version = draft.version;
          latest.error = undefined;

          if (latest.generation === generation) {
            latest.target = draft.target;
            latest.dirty = false;
          }
        }

        const next = stateRef.current;

        if (next) {
          receive({
            ...next,
            drafts: [...next.drafts.filter((d) => d.id !== id), draft],
          });
        }
      } catch (error) {
        const latest = editorRef.current[id];

        if (latest) latest.error = message(error);
        syncEditors();
        throw error;
      }
    }

    // An edit typed during a request must be persisted too before any explicit operation.
    if (Object.values(editorRef.current).some((editor) => editor.dirty))
      await flush();
  };

  const run: GitLabContextValue["run"] = async (action, input = {}) => {
    if (!editable || pendingRef.current) return;
    pendingRef.current = { action, input };
    setPending(pendingRef.current);
    setError(null);

    try {
      await serialize(async () => {
        await flush();

        const next = gitLabStateSchema.parse(
          await request(`/gitlab/${action}`, input),
        );

        if (action === "discard" && input.id !== undefined)
          delete editorRef.current[input.id];
        receive(next);
      });
    } catch (error) {
      if (mounted.current) setError(message(error));
    } finally {
      pendingRef.current = null;

      if (mounted.current) setPending(null);
    }
  };

  useEffect(() => {
    mounted.current = true;

    if (enabled && !loaded.current) {
      loaded.current = true;
      pendingRef.current = { action: "refresh", input: {} };
      setPending(pendingRef.current);
      void serialize(async () => {
        try {
          receive(gitLabStateSchema.parse(await request("/gitlab")));

          if (editable)
            receive(
              gitLabStateSchema.parse(await request("/gitlab/refresh", {})),
            );
        } catch (error) {
          if (mounted.current) setError(message(error));
        } finally {
          pendingRef.current = null;

          if (mounted.current) setPending(null);
        }
      });
    }

    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      void serialize(flush).catch(() => {});
    };
  }, [enabled, editable]);
  // Save before the renderer closes where possible; otherwise warn about unsaved editor text.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.values(editorRef.current).some((e) => e.dirty)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", beforeUnload);

    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const show = () => {
    panels?.getState().close();
    setOpen(true);
  };

  const edit = (id: string, text: string) => {
    if (!editable || busy) return;
    const draft = stateRef.current?.drafts.find((d) => d.id === id);
    const previous = editorRef.current[id];

    if (draft && !["saved", "failed"].includes(draft.status)) return;

    if (!draft && !previous) return;
    editorRef.current[id] = {
      text,
      target: previous?.target ?? draft!.target,
      version: previous?.version ?? draft?.version,
      dirty: true,
      generation: (previous?.generation ?? 0) + 1,
    };
    syncEditors();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void serialize(flush).catch(() => {});
    }, 400);
  };

  const compose: GitLabContextValue["compose"] = (
    target,
    placement = "panel",
  ) => {
    if (!editable || busy) return;

    const existing =
      target.kind === "reply"
        ? stateRef.current?.drafts.find(
            (d) =>
              d.target.kind === "reply" &&
              d.target.discussionId === target.discussionId &&
              ["saved", "failed"].includes(d.status),
          )
        : undefined;

    const id = existing?.id ?? crypto.randomUUID();

    if (!existing) {
      editorRef.current[id] = { text: "", target, dirty: true, generation: 1 };
      syncEditors();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void serialize(flush).catch(() => {});
      }, 400);
    }

    setSelected(id);

    if (placement === "inline") {
      setOpen(false);
    } else show();
  };

  const select = (discussion: GitLabDiscussion) => {
    setSelected(discussion.id);
    show();

    if (
      discussion.location &&
      session.review?.pins?.base === stateRef.current?.refs.baseSha &&
      session.review?.pins?.head === stateRef.current?.refs.headSha
    ) {
      panels?.getState().showView("diff");
      setReveal({ ...discussion.location, nonce: Date.now() });
    }
  };

  const value = useMemo<GitLabContextValue>(
    () => ({
      state,
      editors,
      editable,
      busy,
      pending,
      error,
      open,
      selected,
      reveal,
      toggle: () => {
        const panelState = panels?.getState();

        if (open && !panelState?.active) setOpen(false);
        else show();
      },
      edit,
      compose,
      select,
      run,
    }),
    [
      state,
      editors,
      editable,
      busy,
      pending,
      error,
      open,
      selected,
      reveal,
      edit,
      compose,
      select,
      run,
    ],
  );

  return (
    <Context.Provider value={enabled ? value : null}>
      {children}
    </Context.Provider>
  );
}
