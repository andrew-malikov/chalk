import { useGitLab } from "@canvas/gitlab/gitlab-context";
import { useReviewSession } from "@canvas/host/review-session";
import { controlStyles } from "@canvas/styles/controls-styles";
import { fontSize, layer } from "@canvas/styles/scale.stylex";
import { themeStyles } from "@canvas/styles/theme-styles";
import { tokens } from "@canvas/styles/tokens.stylex";
import { Button } from "@canvas/ui/button";
import { CommandKeyIcon, CopyIcon, ShiftKeyIcon } from "@canvas/ui/icons";
import { surfaceStyles } from "@canvas/ui/surface";
import { useToast } from "@canvas/ui/toast";
import type { AgentSelection } from "@review/review-api/agent-selection";
import * as stylex from "@stylexjs/stylex";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { copyAgentContext } from "./copy-agent-context";

type Selection = Omit<AgentSelection, "revision"> & {
  anchor?: { x: number; y: number };
  anchorElement?: Element;
  anchorContainer?: HTMLElement;
  /** The selected document text, copied for an external agent. */
  range?: Range;
};

type Select = (selection: Selection | null) => void;

const SelectionContext = createContext<Select>(() => {});

export function useAgentSelection() {
  return useContext(SelectionContext);
}

/** A selection is local UI state. Only an explicit copy requests its Markdown. */
export function AgentSelectionProvider({
  revision,
  children,
}: {
  revision: string;
  children: ReactNode;
}) {
  const session = useReviewSession();
  const gitlab = useGitLab();
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

  const bindOverlay = useCallback((node: HTMLSpanElement | null) => {
    setOverlayHost(
      node?.closest<HTMLElement>(".review-canvas-root") ??
        node?.parentElement ??
        null,
    );
  }, []);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [copiedSelection, setCopiedSelection] = useState<string | null>(null);
  const copying = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const pointerElement = useRef<Element | null>(null);
  useEffect(() => {
    const remember = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      const target = event.composedPath()[0];
      pointerElement.current = target instanceof Element ? target : null;
    };

    window.addEventListener("pointerdown", remember, true);

    return () => window.removeEventListener("pointerdown", remember, true);
  }, []);

  const { toast, showToast: setToast } = useToast(4_000);

  const select = useCallback<Select>(
    (value) => {
      if (value) {
        const root = overlayHost?.getRootNode();
        const surface = root instanceof ShadowRoot ? root : document;

        const anchor = value.anchor ??
          pointer.current ?? {
            x: window.innerWidth / 2,
            y: window.innerHeight - 70,
          };

        const element =
          value.anchorElement ??
          surface.elementFromPoint?.(anchor.x, anchor.y) ??
          pointerElement.current;

        // Like the old comment chip, live inside the document's positioning
        // context so browser scrolling moves both the text and its action.
        const container =
          value.anchorContainer ??
          element?.closest<HTMLElement>(".review-document") ??
          overlayHost;

        const rect = container?.getBoundingClientRect();
        value = {
          ...value,
          anchorContainer: container ?? undefined,
          anchor: {
            x: Math.max(8, anchor.x - (rect?.left ?? 0)),
            // Above the selection: the toolbar's 34px and a 2px gap.
            y: anchor.y - (rect?.top ?? 0) - 36,
          },
        };
      }

      if (!value) setCopiedSelection(null);
      setSelection(value);
    },
    [overlayHost],
  );

  useEffect(() => {
    setSelection(null);
  }, [revision]);
  useEffect(
    () =>
      session.surface.subscribe((event) => {
        if (
          event.event !== "editorSelectionChanged" ||
          event.reviewId !== session.config.reviewId ||
          event.isEmpty === undefined ||
          !event.sideContext
        )
          return;

        if (event.isEmpty) {
          select(null);

          return;
        }

        select({
          target: {
            kind: "code",
            path: event.path,
            side: event.sideContext,
            startLine: event.range.fromLine,
            endLine: event.range.toLine,
          },
          selectedDiff: event.selectedDiff,
          apiSource: event.apiSource,
          title: `${event.path}:${event.range.fromLine}–${event.range.toLine}`,
          anchor: event.anchor,
        });
      }),
    [session, select],
  );

  const copy = useCallback(async () => {
    if (!selection || copying.current) return;
    copying.current = true;

    const {
      anchor: _anchor,
      anchorElement: _anchorElement,
      anchorContainer: _anchorContainer,
      range: _range,
      ...payload
    } = selection;

    setCopiedSelection(
      JSON.stringify([
        selection.target,
        selection.selectedDiff,
        selection.apiSource,
      ]),
    );

    try {
      await copyAgentContext(session, { ...payload, revision });
      setToast({
        kind: "success",
        text: "Selection copied to clipboard. Paste into your agent to chat about it.",
      });
    } catch {
      setCopiedSelection(null);
      setToast({
        kind: "error",
        text: "Could not copy selection. Please try again.",
      });
    } finally {
      copying.current = false;
    }
  }, [selection, session, revision]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        selection &&
        event.metaKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void copy();
      }

      if (event.key === "Escape") select(null);
    };

    window.addEventListener("keydown", keydown, true);

    return () => window.removeEventListener("keydown", keydown, true);
  }, [selection, copy, select]);

  return (
    <SelectionContext.Provider value={select}>
      {children}
      <span hidden ref={bindOverlay} />
      {overlayHost &&
        createPortal(
          <>
            {selection &&
              copiedSelection !==
                JSON.stringify([
                  selection.target,
                  selection.selectedDiff,
                  selection.apiSource,
                ]) &&
              createPortal(
                // The toolbar starts at the selection, after a lead that
                // gives way so it never runs past the container's edge.
                <div
                  {...stylex.props(themeStyles.vars, styles.lane)}
                  style={{ top: selection.anchor?.y }}
                >
                  <span
                    {...stylex.props(styles.lead)}
                    style={{ flexBasis: selection.anchor?.x }}
                  />
                  <div
                    {...stylex.props(surfaceStyles.popover, styles.actions)}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    {gitlab?.editable &&
                      gitlab.state &&
                      selection.target.kind === "code" &&
                      !selection.apiSource?.commit &&
                      gitlab.state.refs.headSha ===
                        session.review?.pins?.head &&
                      gitlab.state.refs.baseSha ===
                        session.review?.pins?.base &&
                      (!selection.apiSource?.pins ||
                        (selection.apiSource.pins.head ===
                          session.review?.pins?.head &&
                          (selection.target.side === "head" ||
                            (selection.apiSource.pins.base ??
                              selection.apiSource.pins.head) ===
                              session.review?.pins?.base))) &&
                      (!selection.apiSource ||
                        selection.apiSource.reviewId ===
                          session.config.reviewId) && (
                        <Button
                          disabled={gitlab.busy}
                          onClick={() => {
                            if (
                              selection.target.kind !== "code" ||
                              !gitlab.state
                            )
                              return;
                            const target = selection.target;
                            gitlab.compose(
                              {
                                kind: "inline",
                                position: {
                                  ...gitlab.state.refs,
                                  oldPath:
                                    selection.selectedDiff?.oldPath ||
                                    target.path,
                                  newPath:
                                    selection.selectedDiff?.newPath ||
                                    target.path,
                                  side: target.side,
                                  from: target.startLine,
                                  to: target.endLine,
                                },
                              },
                              selection.anchorContainer?.closest(
                                "[data-pierre-diff]",
                              )
                                ? "inline"
                                : "panel",
                            );
                            select(null);
                          }}
                        >
                          GitLab comment
                        </Button>
                      )}
                    <Button
                      variant="ghost"
                      aria-keyshortcuts="Meta+Shift+C"
                      aria-label="Copy ref"
                      onClick={() => void copy()}
                    >
                      <CopyIcon xstyle={controlStyles.inlineIcon} />
                      <span>Copy ref</span>
                      <kbd aria-hidden="true" {...stylex.props(styles.key)}>
                        <ShiftKeyIcon />
                        <CommandKeyIcon />C
                      </kbd>
                    </Button>
                  </div>
                </div>,
                selection.anchorContainer ?? overlayHost,
              )}
            {toast}
          </>,
          overlayHost,
        )}
    </SelectionContext.Provider>
  );
}

const styles = stylex.create({
  // Spans its container, short of the right edge; only the toolbar takes
  // the pointer. Outside .review-app it brings the chrome tokens.
  lane: {
    position: "absolute",
    left: 0,
    right: "8px",
    zIndex: layer.agentSelection,
    display: "flex",
    pointerEvents: "none",
  },
  lead: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  actions: {
    position: "relative",
    flex: "none",
    pointerEvents: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    padding: "4px",
    whiteSpace: "nowrap",
  },
  key: {
    display: "inline-flex",
    alignItems: "center",
    gap: "1px",
    fontFamily: tokens.fontMono,
    fontSize: fontSize.micro,
    lineHeight: "14px",
    opacity: 0.65,
  },
});
