import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { Input } from "@canvas/components/ui/input";
import { useOptionalReviewSession } from "@canvas/host/review-session";
import { setCssHighlight } from "@canvas/lib/css-highlights";
import { cn } from "@canvas/lib/utils";
import { IconButton } from "@canvas/ui/button";
import { surfaceStyles } from "@canvas/ui/surface";
import { fieldStyles } from "@canvas/ui/text-field";
import type {
  ReviewFindQuery,
  ReviewInlineEditorHandle,
} from "@chalk/review-contracts";
import { useActorRef, useSelector } from "@xstate/react";
import type { ClassValue } from "clsx";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  createContext,
  createRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ActorRefFrom } from "xstate";

import { type ReviewFindMatch, reviewFindMachine } from "./review-find-machine";
import { compileReviewFindQuery } from "./review-find-query";
import { reviewFindRanges } from "./review-find-text";
import { useReviewRoots } from "./review-root-context";

const ALL_HIGHLIGHT = "review-find-match";

const ACTIVE_HIGHLIGHT = "review-find-match-active";

const SEARCH_DELAY_MS = 150;

interface FindController {
  showFind(seed?: string): boolean;
  hideFind(): void;
}

export interface ReviewFindHost extends FindController {
  attach(controller: FindController | null): void;
}

export function createReviewFindHost(): ReviewFindHost {
  let controller: FindController | null = null;

  return {
    attach(next) {
      controller = next;
    },
    showFind(seed) {
      return controller?.showFind(seed) ?? false;
    },
    hideFind() {
      controller?.hideFind();
    },
  };
}

export interface ReviewInlineFindRegistration {
  container: HTMLElement;
  setFindQuery(query: ReviewFindQuery): Promise<{ matchCount: number }>;
  revealFindMatch(index: number): Promise<void>;
  clearFind(): void;
  getHandle(): ReviewInlineEditorHandle | null;
  expand(): void;
}

interface FindContextValue {
  register(registration: ReviewInlineFindRegistration): () => void;
  setReviewActive(active: boolean): void;
}

const ReviewFindContext = createContext<FindContextValue | null>(null);

export function useReviewFindRegistration(): FindContextValue | null {
  return useContext(ReviewFindContext);
}

export function ReviewFindProvider({
  articleRef,
  documentKey,
  host,
  children,
}: {
  /** Read through for the provider's lifetime; pass a stable ref. */
  articleRef: RefObject<HTMLElement | null>;
  documentKey: string;
  host?: ReviewFindHost;
  children: ReactNode;
}) {
  const session = useOptionalReviewSession();

  const actor = useActorRef(reviewFindMachine, { input: session?.config });
  const [controller] = useState(() => createFindController(articleRef, actor));

  const previousDocument = useRef(documentKey);

  useLayoutEffect(() => controller.connect(), [controller]);

  useEffect(() => {
    host?.attach(controller);

    return () => host?.attach(null);
  }, [controller, host]);

  // Layout, so a new document's editors never see the old query: their
  // registrations queue a search that runs after this closes.
  useLayoutEffect(() => {
    if (previousDocument.current === documentKey) return;
    previousDocument.current = documentKey;
    controller.resetForDocument();
  }, [controller, documentKey]);

  return (
    <ReviewFindContext.Provider value={controller}>
      {children}
      <ReviewFindWidget controller={controller} />
    </ReviewFindContext.Provider>
  );
}

type ReviewFindController = ReturnType<typeof createFindController>;

/** Owns everything find touches outside React state: editor registrations,
 * highlights, focus, and scrolling. */
function createFindController(
  articleRef: RefObject<HTMLElement | null>,
  actor: ActorRefFrom<typeof reviewFindMachine>,
) {
  const registrations = new Set<ReviewInlineFindRegistration>();
  const inputRef = createRef<HTMLInputElement>();
  let reviewActive = true;
  let priorFocus: HTMLElement | null = null;
  let searchScheduled = false;
  let connected = false;

  const clearHighlights = () => {
    setCssHighlight(articleRef.current, ALL_HIGHLIGHT, []);
    setCssHighlight(articleRef.current, ACTIVE_HIGHLIGHT, []);

    for (const registration of registrations) {
      registration.clearFind();
    }
  };

  const close = (restoreFocus: boolean, clearQuery = false) => {
    clearHighlights();
    actor.send({ type: "close", clearQuery });
    const target = priorFocus;
    priorFocus = null;

    if (restoreFocus && target?.isConnected) target.focus();
  };

  const reveal = (index: number) => {
    const { matches } = actor.getSnapshot().context;

    if (matches.length === 0) return;
    const wrapped = (index + matches.length) % matches.length;
    const match = matches[wrapped]!;
    actor.send({ type: "setActiveIndex", index: wrapped });
    setCssHighlight(articleRef.current, ACTIVE_HIGHLIGHT, []);

    for (const registration of registrations) {
      registration.getHandle()?.clearActiveFindMatch();
    }

    // A frame later the search may have closed or moved on.
    const current = () =>
      connected && actor.getSnapshot().context.matches.includes(match);

    if (match.kind === "mdx") {
      expandReviewSection(match.node);
      requestAnimationFrame(() => {
        if (!current()) return;
        setCssHighlight(articleRef.current, ACTIVE_HIGHLIGHT, [match.range]);
        rangeElement(match.range)?.scrollIntoView?.({ block: "center" });
        inputRef.current?.focus();
      });
    } else {
      match.registration.expand();
      requestAnimationFrame(async () => {
        if (!current()) return;
        match.registration.container.scrollIntoView?.({ block: "center" });
        await match.registration.revealFindMatch(match.localIndex);
        inputRef.current?.focus();
      });
    }
  };

  const search = () => {
    const snapshot = actor.getSnapshot();
    const { query } = snapshot.context;

    if (!connected || !snapshot.matches("open")) return;

    if (!query.text) {
      clearHighlights();
      actor.send({ type: "clearResults" });

      return;
    }

    const compiled = compileReviewFindQuery(query);

    if ("error" in compiled) {
      actor.send({ type: "rejectQuery", error: compiled.error });

      return;
    }

    clearHighlights();
    // A search triggered by a subscriber queues its event until that notification ends.
    const generation = snapshot.context.generation + 1;
    actor.send({ type: "startSearch" });
    // Editor searches are expensive; only a query the reader pauses on runs.
    setTimeout(() => {
      if (connected && actor.getSnapshot().context.generation === generation) {
        run(generation, query, compiled.expression);
      }
    }, SEARCH_DELAY_MS);
  };

  const run = (
    generation: number,
    query: ReviewFindQuery,
    expression: RegExp,
  ) => {
    const article = articleRef.current;

    const ranges = article ? reviewFindRanges(article, expression) : [];

    const orderedRegistrations = [...registrations].sort((left, right) =>
      compareDocumentOrder(left.container, right.container),
    );

    void Promise.all(
      orderedRegistrations.map(async (registration) => {
        try {
          const result = await registration.setFindQuery({
            ...query,
            text: expression.source,
            wholeWord: false,
            isRegex: true,
          });

          return { registration, matchCount: result.matchCount };
        } catch {
          return { registration, matchCount: 0 };
        }
      }),
    ).then((editorResults) => {
      const matches: ReviewFindMatch[] = [
        ...ranges.map((range) => ({
          kind: "mdx" as const,
          range,
          node: range.startContainer,
        })),
        ...editorResults.flatMap(({ registration, matchCount }) =>
          Array.from({ length: matchCount }, (_, localIndex) => ({
            kind: "editor" as const,
            registration,
            localIndex,
            node: registration.container,
          })),
        ),
      ].sort((left, right) => compareDocumentOrder(left.node, right.node));

      if (!connected || actor.getSnapshot().context.generation !== generation)
        return;
      actor.send({ type: "completeSearch", generation, matches });
      setCssHighlight(article, ALL_HIGHLIGHT, ranges);

      if (matches.length > 0) reveal(0);
    });
  };

  // Registrations arrive in bursts as a document mounts; search once.
  const scheduleSearch = () => {
    if (searchScheduled) return;
    searchScheduled = true;
    queueMicrotask(() => {
      searchScheduled = false;
      search();
    });
  };

  return {
    actor,
    inputRef,
    connect() {
      connected = true;
      let previous = actor.getSnapshot();

      const subscription = actor.subscribe((snapshot) => {
        const changed =
          snapshot.matches("open") !== previous.matches("open") ||
          snapshot.context.query !== previous.context.query;

        previous = snapshot;

        if (changed) search();
      });

      return () => {
        connected = false;
        subscription.unsubscribe();
        clearHighlights();
        actor.send({ type: "close" });
      };
    },
    showFind(seed?: string) {
      if (!reviewActive) return false;

      if (!actor.getSnapshot().matches("open")) {
        const active = articleRef.current?.ownerDocument.activeElement;
        priorFocus = active instanceof HTMLElement ? active : null;
        actor.send({
          type: "show",
          seed: seed ?? selectedMdxText(articleRef.current),
        });
      }

      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });

      return true;
    },
    hideFind() {
      close(true);
    },
    navigate(delta: number) {
      const snapshot = actor.getSnapshot();
      const { matches, activeIndex } = snapshot.context;
      const searching = snapshot.matches({ open: "searching" });

      if (!searching && matches.length > 0) reveal(activeIndex + delta);
    },
    resetForDocument() {
      close(true, true);
    },
    register(registration: ReviewInlineFindRegistration) {
      registrations.add(registration);
      scheduleSearch();

      return () => {
        registration.clearFind();
        registrations.delete(registration);
        actor.send({ type: "forgetRegistration", registration });
        scheduleSearch();
      };
    },
    setReviewActive(active: boolean) {
      reviewActive = active;

      if (!active && actor.getSnapshot().matches("open")) close(false);
    },
  };
}

function ReviewFindWidget({
  controller,
}: {
  controller: ReviewFindController;
}) {
  const { actor, inputRef } = controller;
  const shellRef = useReviewRoots()?.shellRef;
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  const open = useSelector(actor, (snapshot) => snapshot.matches("open"));
  const query = useSelector(actor, (snapshot) => snapshot.context.query);

  const searching = useSelector(actor, (snapshot) =>
    snapshot.matches({ open: "searching" }),
  );

  const invalid = useSelector(actor, (snapshot) => snapshot.context.error);

  const matchCount = useSelector(
    actor,
    (snapshot) => snapshot.context.matches.length,
  );

  const activeIndex = useSelector(
    actor,
    (snapshot) => snapshot.context.activeIndex,
  );

  // Passive, not layout: a descendant's layout effect runs before the ancestor
  // host ref attaches, so the shell is not there yet; no deps because the shell
  // remounts under this provider on route change.
  useEffect(() => {
    setOverlayHost(shellRef?.current ?? null);
  });

  if (!open || !overlayHost) return null;

  return createPortal(
    <div
      className={cn("review-find-widget", surfaceStyles.popover, styles.widget)}
      role="search"
      aria-label="Find in session"
    >
      <div
        className={cn(
          fieldStyles.box,
          fieldStyles.shell,
          styles.inputShell,
          invalid ? styles.inputShellInvalid : null,
        )}
      >
        <Input
          ref={inputRef}
          className={styles.input}
          aria-label="Find"
          aria-invalid={invalid ? "true" : undefined}
          title={invalid ?? undefined}
          value={query.text}
          onChange={(event) =>
            actor.send({ type: "setText", text: event.currentTarget.value })
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              controller.hideFind();
            } else if (event.key === "Enter") {
              event.preventDefault();
              controller.navigate(event.shiftKey ? -1 : 1);
            }
          }}
        />
        <div className={styles.options} aria-label="Search options">
          <FindToggle
            label="Match Case"
            description="Match Case: use the same uppercase and lowercase letters."
            active={query.matchCase}
            onClick={() =>
              actor.send({ type: "toggleOption", option: "matchCase" })
            }
          >
            Aa
          </FindToggle>
          <FindToggle
            label="Match Whole Word"
            description="Match Whole Word: find complete words only."
            className={styles.wholeWord}
            active={query.wholeWord}
            onClick={() =>
              actor.send({ type: "toggleOption", option: "wholeWord" })
            }
          >
            ab
          </FindToggle>
          <FindToggle
            label="Use Regular Expression"
            description="Use Regular Expression: search with a regular expression."
            className={styles.regex}
            active={query.isRegex}
            onClick={() =>
              actor.send({ type: "toggleOption", option: "isRegex" })
            }
          >
            .*
          </FindToggle>
        </div>
      </div>
      <span className={styles.count} aria-live="polite">
        {invalid
          ? "Invalid expression"
          : searching
            ? "Searching…"
            : matchCount === 0
              ? "No results"
              : `${activeIndex + 1} of ${matchCount}`}
      </span>
      <FindActionButton
        label="Previous Match"
        description="Previous Match (Shift+Enter)"
        disabled={searching || matchCount === 0}
        onClick={() => controller.navigate(-1)}
        icon="previous"
      />
      <FindActionButton
        label="Next Match"
        description="Next Match (Enter)"
        disabled={searching || matchCount === 0}
        onClick={() => controller.navigate(1)}
        icon="next"
      />
      <FindActionButton
        label="Close Find"
        description="Close Find (Escape)"
        onClick={controller.hideFind}
        icon="close"
      />
    </div>,
    overlayHost,
  );
}

function FindToggle({
  label,
  description,
  className,
  active,
  onClick,
  children,
}: {
  label: string;
  description: string;
  className?: ClassValue;
  active: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <ButtonPrimitive
      variant="ghost"
      size="xs"
      type="button"
      className={cn(styles.toggle, active && styles.togglePressed, className)}
      aria-label={label}
      aria-pressed={active}
      title={description}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </ButtonPrimitive>
  );
}

function FindActionButton({
  label,
  description,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  description: string;
  disabled?: boolean;
  onClick(): void;
  icon: "previous" | "next" | "close";
}) {
  return (
    <IconButton
      aria-label={label}
      title={description}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <FindActionIcon icon={icon} />
    </IconButton>
  );
}

function FindActionIcon({ icon }: { icon: "previous" | "next" | "close" }) {
  const Icon = icon === "previous" ? ArrowUp : icon === "next" ? ArrowDown : X;

  return <Icon className={styles.actionIcon} aria-hidden="true" />;
}

function selectedMdxText(article: HTMLElement | null): string | undefined {
  const selection = article?.ownerDocument.getSelection();

  if (!article || !selection || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);

  if (!article.contains(range.commonAncestorContainer)) return undefined;

  return selection.toString().trim() || undefined;
}

function expandReviewSection(node: Node): void {
  const element = node instanceof Element ? node : node.parentElement;
  element
    ?.closest(".review-section--collapsed")
    ?.dispatchEvent(new CustomEvent("review-section-expand"));
}

function rangeElement(range: Range): Element | null {
  return range.startContainer instanceof Element
    ? range.startContainer
    : range.startContainer.parentElement;
}

function compareDocumentOrder(left: Node, right: Node): number {
  if (left === right) return 0;
  const position = left.compareDocumentPosition(right);

  return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

const styles = {
  widget:
    "tw:absolute tw:z-[120] tw:top-[48px] tw:right-[16px] tw:[@media_(max-width:_620px)]:right-[8px] tw:[@media_(max-width:_620px)]:left-[8px] tw:flex tw:items-center tw:min-w-[490px] tw:[@media_(max-width:_620px)]:min-w-0 tw:max-w-[calc(100vw_-_32px)] tw:[@media_(max-width:_620px)]:max-w-none tw:h-[34px] tw:gap-[3px] tw:p-[3px_4px_3px_6px]",
  inputShell:
    "tw:flex tw:items-center tw:flex-[1] tw:min-w-[160px] tw:gap-[1px] tw:p-[0_2px_0_6px]",
  inputShellInvalid: "tw:border-[color:var(--change-removed)]",
  input:
    "tw:flex-[1] tw:min-w-0 tw:h-full tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:transparent] tw:text-[color:var(--ink)] tw:font-[family-name:var(--chrome-font)] tw:text-[length:12px] tw:[outline:none]",
  options: "tw:flex tw:items-center tw:flex-[0_0_auto] tw:gap-[1px]",
  count:
    "tw:grow-0 tw:shrink-0 tw:basis-[auto] tw:[@media_(max-width:_620px)]:basis-[56px] tw:min-w-[64px] tw:ml-[4px] tw:p-[0_3px] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--chrome-font)] tw:text-[length:12px] tw:leading-[16px] tw:text-center tw:whitespace-nowrap",
  toggle:
    "tw:flex tw:items-center tw:justify-center tw:border-[1px] tw:border-solid tw:rounded-[3px] tw:cursor-pointer tw:[&:focus-visible]:[outline:1px_solid_var(--accent)] tw:[&:focus-visible]:outline-offset-[1px] tw:flex-[0_0_22px] tw:w-[22px] tw:h-[20px] tw:p-0 tw:border-[color:transparent] tw:bg-[color:transparent] tw:[&:hover:not(:disabled)]:bg-[color:var(--vscode-toolbar-hoverBackground,_var(--tray))] tw:text-[color:var(--ink-muted)] tw:[&:hover:not(:disabled)]:text-[color:var(--ink)] tw:font-[family-name:var(--chrome-font)] tw:text-[length:12px] tw:leading-[16px]",
  togglePressed:
    "tw:border-[color:var(--accent)] tw:bg-[color:var(--vscode-inputOption-activeBackground,_var(--tray))] tw:[&:hover:not(:disabled)]:bg-[color:var(--vscode-toolbar-hoverBackground,_var(--tray))] tw:text-[color:var(--vscode-inputOption-activeForeground,_var(--ink))] tw:[&:hover:not(:disabled)]:text-[color:var(--ink)]",
  wholeWord:
    "tw:[text-decoration-line:underline] tw:[text-underline-offset:2px]",
  regex: "tw:font-[family-name:var(--font-mono)]",
  actionIcon:
    "tw:size-[14px] tw:fill-[none] tw:stroke-[currentcolor] tw:[stroke-linecap:round] tw:[stroke-linejoin:round] tw:stroke-[2]",
};
