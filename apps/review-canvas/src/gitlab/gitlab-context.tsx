import { useReviewSession } from "@canvas/host/review-session";
import { useOptionalReviewPanelActor } from "@canvas/review/review-panel";
import type { GitLabDiscussion, GitLabTarget } from "@chalk/review-contracts";
import { useActorRef, useSelector } from "@xstate/react";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { z } from "zod";

import {
  type GitLabAction,
  type GitLabActionInput,
  type GitLabSnapshot,
  createGitLabMachine,
  saveDraft,
} from "./gitlab-machine";

type GitLabContextValue = Pick<
  GitLabSnapshot["context"],
  "state" | "editors" | "pending" | "error" | "selected"
> & {
  editable: boolean;
  busy: boolean;
  open: boolean;
  /** Inline threads the user collapsed or expanded; unset ones follow `resolved`. */
  collapsed: Record<string, boolean>;
  collapse(id: string, value: boolean): void;
  toggle(): void;
  edit(id: string, text: string): void;
  compose(target: GitLabTarget, placement?: "inline" | "panel"): void;
  select(discussion: GitLabDiscussion): void;
  run(action: GitLabAction, input?: GitLabActionInput): void;
  reveal: {
    file: string;
    side: "base" | "head";
    from: number;
    to: number;
    nonce: number;
  } | null;
};

const Context = createContext<GitLabContextValue | null>(null);

export function useGitLab() {
  return useContext(Context);
}

/** Draft state lives in the GitLab machine; this adds the panel and diff coordination around it. */
export function GitLabProvider({ children }: { children: ReactNode }) {
  const session = useReviewSession();
  const panels = useOptionalReviewPanelActor();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const enabled = !!session.review?.gitlab;

  const editable = enabled && session.review?.historicalRevision === null;

  const [request] = useState(
    () =>
      async (endpoint: `/${string}`, input?: object): Promise<unknown> => {
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
      },
  );

  const [machine] = useState(() => createGitLabMachine(request));
  const actor = useActorRef(machine);
  const { state, editors, pending, error, selected } = useSelector(
    actor,
    (snapshot) => snapshot.context,
  );

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [reveal, setReveal] = useState<GitLabContextValue["reveal"]>(null);

  useEffect(() => {
    if (enabled) actor.send({ type: "load", editable });
  }, [actor, enabled, editable]);
  // The actor stops with the provider; send text the debounce has not saved yet.
  // shortcut: unordered after a save still in flight for the same draft, which then fails on its version; queue behind it if that shows up.
  useEffect(
    () => () => {
      for (const [id, editor] of Object.entries(
        actor.getSnapshot().context.editors,
      ))
        if (editor.dirty) void saveDraft(request, id, editor).catch(() => {});
    },
    [actor, request],
  );
  // Save before the renderer closes where possible; otherwise warn about unsaved editor text.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        Object.values(actor.getSnapshot().context.editors).some((e) => e.dirty)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", beforeUnload);

    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [actor]);

  const show = () => {
    panels?.send({ type: "close" });
    setOpen(true);
  };

  const value: GitLabContextValue = {
    state,
    editors,
    editable,
    busy: pending !== null,
    pending,
    error,
    open,
    selected,
    collapsed,
    collapse: (id, value) =>
      setCollapsed((current) => ({ ...current, [id]: value })),
    reveal,
    toggle: () => {
      const panelState = panels?.getSnapshot().context;

      if (open && !panelState?.active) setOpen(false);
      else show();
    },
    edit: (id, text) => actor.send({ type: "edit", id, text }),
    compose: (target, placement = "panel") => {
      const event = {
        type: "compose" as const,
        id: crypto.randomUUID(),
        target,
      };

      if (!actor.getSnapshot().can(event)) return;
      actor.send(event);

      if (placement === "inline") {
        setOpen(false);
      } else show();
    },
    select: (discussion) => {
      actor.send({ type: "select", id: discussion.id });
      setCollapsed((current) => ({ ...current, [discussion.id]: false }));
      show();

      if (
        discussion.location &&
        session.review?.pins?.base === state?.refs.baseSha &&
        session.review?.pins?.head === state?.refs.headSha
      ) {
        panels?.send({ type: "showView", view: "diff" });
        setReveal({ ...discussion.location, nonce: Date.now() });
      }
    },
    run: (action, input) => actor.send({ type: "run", action, input }),
  };

  return (
    <Context.Provider value={enabled ? value : null}>
      {children}
    </Context.Provider>
  );
}
