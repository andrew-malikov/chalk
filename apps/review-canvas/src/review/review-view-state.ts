import type { ReviewClientConfig } from "@canvas/host/review-client";
import { useReviewSession } from "@canvas/host/review-session";
import {
  type JsonObject,
  type JsonValue,
  type ReviewCommitSummary,
  isJsonObject,
  jsonNumber,
  jsonObject,
  jsonProperty,
  jsonString,
  reviewViewSchema,
} from "@chalk/review-contracts";
import { useActorRef } from "@xstate/react";
import type { RefObject } from "react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { type ActorRefFrom, assign, setup } from "xstate";

import type {
  OverlayTour,
  ReviewLensSelection,
  ReviewNavigationRestore,
  ReviewPanelActor,
} from "./review-panel-machine";
import { reviewPersistence } from "./review-persistence";
import { removeReviewUiState, reviewUiStateKey } from "./review-ui-state";
import { type ReviewView, offeredReviewViews } from "./review-view-route";

const REVIEW_VIEW_STATE_NAMESPACE = "view-state";

const SCROLL_RESTORE_DEADLINE_MS = 30_000;

export interface PersistedReviewViewState {
  scrollTop?: number;
  activeView?: ReviewView;
  /** The lens applied to the diff; restored only on its own version. */
  lens?: ReviewLensSelection;
  /** Written by older builds for an in-panel tour; read only as a fallback. */
  panel?: PersistedTourPanel;
  /** A fullscreen diagram tour that was open. */
  overlayTour?: PersistedOverlayTour;
  /** The commit the diff was scoped to; restored while the version lists it. */
  diffScope?: { commit: string; file?: string };

  /** The view `scrollTop` was taken on; absent on older records ("review"). */
  scrollView?: ReviewView;
}

export interface PersistedOverlayTour {
  tourId: string;
  activeAnchor: string;
  kind?: OverlayTour["kind"];
}

export interface PersistedTourPanel {
  kind: "tour";
  tourId: string;
  activeAnchor: string;
}

export function useReviewViewStateSync({
  scrollRegionRef,
  panelActor,
}: {
  scrollRegionRef: RefObject<HTMLElement | null>;
  panelActor: ReviewPanelActor;
}): void {
  const session = useReviewSession();
  const key = reviewViewStateKey(session.config);

  const initialState = useMemo(() => viewPersistence(key).read({}), [key]);

  const saved = useActorRef(reviewViewStateMachine, {
    input: { key, value: initialState },
  });

  useLayoutEffect(() => {
    saved.send({ type: "configure", key, value: initialState });
  }, [saved, key, initialState]);

  // Layout, so navigation from a host event right after mount still persists.
  useLayoutEffect(() => {
    let previous = panelActor.getSnapshot();

    const subscription = panelActor.subscribe((snapshot) => {
      const state = snapshot.context;
      const prior = previous.context;
      const viewChanged = snapshot.value !== previous.value;
      previous = snapshot;

      if (
        !viewChanged &&
        state.lens === prior.lens &&
        state.overlayTour === prior.overlayTour &&
        state.diffScope === prior.diffScope
      ) {
        return;
      }

      // A restored legacy panel is rewritten as a fullscreen tour.
      saved.send({
        type: "update",
        value: {
          panel: undefined,
          ...(viewChanged && { activeView: snapshot.value }),
          ...(state.lens !== prior.lens && { lens: state.lens ?? undefined }),
          // A scope dropped during restoration must stay dropped on later versions.
          diffScope: state.diffScope
            ? {
                commit: state.diffScope.commit.commit,
                file: state.diffScope.file,
              }
            : undefined,
          overlayTour: state.overlayTour
            ? {
                tourId: state.overlayTour.tourId,
                activeAnchor: state.overlayTour.anchor,
                kind: state.overlayTour.kind,
              }
            : undefined,
        },
      });
    });

    return () => subscription.unsubscribe();
  }, [panelActor, saved, key]);

  // A scroll position belongs to the view it was taken on.
  const restoreScrollTop = useMemo(
    () =>
      (initialState.scrollView ?? "review") === panelActor.getSnapshot().value
        ? initialState.scrollTop
        : undefined,
    [initialState, panelActor],
  );

  const scrollRestorationPending = useScrollRestoration(
    scrollRegionRef,
    panelActor,
    restoreScrollTop,
  );

  useScrollCapture(
    scrollRegionRef,
    panelActor,
    saved,
    scrollRestorationPending,
    key,
  );
}

/** The navigation a canvas resumes: its stored view where the canvas still
 * offers it, its stored lens when that lens belongs to this version, the
 * commit its diff was scoped to while this version lists it, the picked
 * and the fullscreen tour that was open. */
export function readReviewNavigationRestore(
  config: ReviewClientConfig,
  canvas: {
    softwareMapEnabled: boolean;
    hasChangeRange: boolean;
    version: number;
    lensMode: ReviewLensSelection["mode"];
    commits: readonly ReviewCommitSummary[];
  },
): ReviewNavigationRestore {
  const stored = readPersistedReviewViewState(config);

  const tour: PersistedOverlayTour | undefined =
    stored.overlayTour ??
    (stored.panel && {
      tourId: stored.panel.tourId,
      activeAnchor: stored.panel.activeAnchor,
    });

  const scopedCommit =
    stored.activeView === "diff" && stored.diffScope
      ? canvas.commits.find(
          (summary) => summary.commit === stored.diffScope!.commit,
        )
      : undefined;

  return {
    view: stored.activeView ?? "review",
    availableViews: offeredReviewViews({
      hasChangeRange: canvas.hasChangeRange,
      softwareMapEnabled: canvas.softwareMapEnabled,
    }),
    lens:
      stored.lens?.version === canvas.version &&
      stored.lens.mode === canvas.lensMode
        ? stored.lens
        : null,
    diffScope: scopedCommit
      ? {
          commit: scopedCommit,
          file: stored.diffScope!.file,
          restoreFile: true,
        }
      : null,

    overlayTour: tour
      ? {
          tourId: tour.tourId,
          kind: tour.kind,
          anchor: tour.activeAnchor,
          revealRequest: 0,
        }
      : null,
  };
}

export function reviewViewStateKey(config: ReviewClientConfig): string {
  return reviewUiStateKey(config, "session", REVIEW_VIEW_STATE_NAMESPACE);
}

export function readPersistedReviewViewState(
  config: ReviewClientConfig,
): PersistedReviewViewState {
  return viewPersistence(reviewViewStateKey(config)).read({});
}

export function clearPersistedReviewViewState(
  config: ReviewClientConfig,
): void {
  removeReviewUiState("session", reviewViewStateKey(config));
}

function viewPersistence(key: string) {
  return reviewPersistence<PersistedReviewViewState, PersistedReviewViewState>({
    key,
    scope: "session",
    legacy: true,
    partialize: (state) => state,
    parse: parsePersistedReviewViewState,
  });
}

interface ReviewViewStateInput {
  key: string;
  value: PersistedReviewViewState;
}

type ReviewViewStateEvent =
  | { type: "configure"; key: string; value: PersistedReviewViewState }
  | { type: "update"; value: Partial<PersistedReviewViewState> };

const reviewViewStateMachine = setup({
  types: {
    // SAFETY: XState reads `context` only for type inference.
    context: {} as ReviewViewStateInput,
    // SAFETY: XState reads `input` only for type inference.
    input: {} as ReviewViewStateInput,
    // SAFETY: XState reads `events` only for type inference.
    events: {} as ReviewViewStateEvent,
  },
}).createMachine({
  context: ({ input }) => input,
  on: {
    configure: {
      guard: ({ context, event }) => context.key !== event.key,
      actions: assign(({ event }) => ({ key: event.key, value: event.value })),
    },
    update: {
      actions: [
        assign({
          value: ({ context, event }) => ({ ...context.value, ...event.value }),
        }),
        ({ context }) => viewPersistence(context.key).write(context.value),
      ],
    },
  },
});

function useScrollRestoration(
  scrollRegionRef: RefObject<HTMLElement | null>,
  panelActor: ReviewPanelActor,
  scrollTop: number | undefined,
): RefObject<boolean> {
  const pendingRef = useRef(false);
  useLayoutEffect(() => {
    const scrollRegion = scrollRegionRef.current;
    pendingRef.current = scrollRegion !== null && scrollTop !== undefined;

    if (!scrollRegion || scrollTop === undefined) return;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let aborted = false;

    const removeUserListeners = () => {
      scrollRegion.removeEventListener("wheel", abortForUserInput);
      scrollRegion.removeEventListener("pointerdown", abortForUserInput);
      scrollRegion.removeEventListener("touchstart", abortForUserInput);
      scrollRegion.removeEventListener("keydown", abortForNavigationKey);
      viewSubscription.unsubscribe();
    };

    const finish = () => {
      if (aborted) return;
      aborted = true;
      pendingRef.current = false;

      if (deadline !== null) clearTimeout(deadline);
      deadline = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      removeUserListeners();
    };

    const restore = () => {
      if (aborted) return;

      const maxScrollTop = Math.max(
        0,
        scrollRegion.scrollHeight - scrollRegion.clientHeight,
      );

      scrollRegion.scrollTop = Math.min(scrollTop, maxScrollTop);

      if (scrollTop <= maxScrollTop) {
        finish();
      }
    };

    const abortForUserInput = () => finish();

    const abortForNavigationKey = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        [
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "End",
          "Home",
          "PageDown",
          "PageUp",
        ].includes(event.key)
      ) {
        finish();
      }
    };

    scrollRegion.addEventListener("wheel", abortForUserInput, {
      passive: true,
    });
    scrollRegion.addEventListener("pointerdown", abortForUserInput, {
      passive: true,
    });
    scrollRegion.addEventListener("touchstart", abortForUserInput, {
      passive: true,
    });
    scrollRegion.addEventListener("keydown", abortForNavigationKey);

    // The position belongs to the view it was taken on.
    const initialView = panelActor.getSnapshot().value;

    const viewSubscription = panelActor.subscribe((snapshot) => {
      if (snapshot.value !== initialView) finish();
    });

    resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(restore);

    if (resizeObserver) {
      resizeObserver.observe(scrollRegion);

      for (const child of layoutChildren(scrollRegion)) {
        resizeObserver.observe(child);
      }
    }

    deadline = setTimeout(finish, SCROLL_RESTORE_DEADLINE_MS);
    restore();

    return () => {
      if (deadline !== null) clearTimeout(deadline);
      resizeObserver?.disconnect();
      removeUserListeners();
      pendingRef.current = false;
    };
  }, [panelActor, scrollRegionRef, scrollTop]);

  return pendingRef;
}

/**
 * The region's box-generating children: any descendant growing resizes one of
 * them, so observing these sees every change without observing the document.
 * `display: contents` wrappers generate no box, so look through them.
 */
function* layoutChildren(element: Element): Generator<Element> {
  for (const child of element.children) {
    if (getComputedStyle(child).display === "contents") {
      yield* layoutChildren(child);
    } else {
      yield child;
    }
  }
}

function useScrollCapture(
  scrollRegionRef: RefObject<HTMLElement | null>,
  panelActor: ReviewPanelActor,
  saved: ActorRefFrom<typeof reviewViewStateMachine>,
  restorationPending: RefObject<boolean>,
  key: string,
): void {
  // Flush while the actor is still running; useActorRef stops it in passive cleanup.
  useLayoutEffect(() => {
    const scrollRegion = scrollRegionRef.current;

    if (!scrollRegion) return;
    let frame: number | null = null;
    let dirty = false;

    const write = () => {
      frame = null;

      if (!dirty) return;
      dirty = false;

      if (restorationPending.current) return;
      saved.send({
        type: "update",
        value: {
          scrollTop: scrollRegion.scrollTop,
          scrollView: panelActor.getSnapshot().value,
        },
      });
    };

    const onScroll = () => {
      dirty = true;

      if (frame === null) frame = requestAnimationFrame(write);
    };

    scrollRegion.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      scrollRegion.removeEventListener("scroll", onScroll);

      if (frame !== null) cancelAnimationFrame(frame);

      if (dirty) write();
    };
  }, [panelActor, saved, restorationPending, scrollRegionRef, key]);
}

function parsePersistedReviewViewState(
  value: JsonValue | null,
): PersistedReviewViewState {
  if (!isJsonObject(value)) return {};
  const state: PersistedReviewViewState = {};
  const scrollTop = jsonNumber(jsonProperty(value, "scrollTop"));

  if (scrollTop !== undefined && scrollTop >= 0) state.scrollTop = scrollTop;
  const activeView = jsonString(jsonProperty(value, "activeView"));

  if (isReviewView(activeView)) state.activeView = activeView;
  const scrollView = jsonString(jsonProperty(value, "scrollView"));

  if (isReviewView(scrollView)) state.scrollView = scrollView;
  const diffScope = jsonObject(jsonProperty(value, "diffScope"));
  const commit = jsonString(diffScope && jsonProperty(diffScope, "commit"));

  if (commit && /^[0-9a-f]{40}$/i.test(commit)) {
    const file = jsonString(diffScope && jsonProperty(diffScope, "file"));
    state.diffScope = file === undefined ? { commit } : { commit, file };
  }

  const lens = parsePersistedLens(jsonObject(jsonProperty(value, "lens")));

  if (lens) state.lens = lens;

  const panel = parsePersistedPanel(jsonObject(jsonProperty(value, "panel")));

  if (panel) state.panel = panel;

  const overlayTour = parsePersistedTourState(
    jsonObject(jsonProperty(value, "overlayTour")),
  );

  if (overlayTour) state.overlayTour = overlayTour;

  return state;
}

function isReviewView(value: string | undefined): value is ReviewView {
  return reviewViewSchema.safeParse(value).success;
}

function parsePersistedLens(
  lens: JsonObject | undefined,
): ReviewLensSelection | undefined {
  if (!lens) return undefined;
  const id = jsonString(jsonProperty(lens, "id"));
  const version = jsonNumber(jsonProperty(lens, "version"));
  const mode = jsonString(jsonProperty(lens, "mode"));

  return id !== undefined &&
    version !== undefined &&
    (mode === "structural" || mode === "textual")
    ? { id, version, mode }
    : undefined;
}

function parsePersistedPanel(
  panel: JsonObject | undefined,
): PersistedTourPanel | undefined {
  if (!panel) return undefined;
  const kind = jsonString(jsonProperty(panel, "kind"));
  const tour = parsePersistedTourState(panel);

  if (kind === "tour" && tour) {
    return {
      kind: "tour",
      tourId: tour.tourId,
      activeAnchor: tour.activeAnchor,
    };
  }

  return undefined;
}

function parsePersistedTourState(
  tour: JsonObject | undefined,
): PersistedOverlayTour | undefined {
  const tourId = jsonString(tour && jsonProperty(tour, "tourId"));
  const activeAnchor = jsonString(tour && jsonProperty(tour, "activeAnchor"));
  const kind = jsonString(tour && jsonProperty(tour, "kind"));

  if (tourId === undefined || activeAnchor === undefined) return undefined;

  return kind === "sequence" || kind === "database" || kind === "flow"
    ? { tourId, activeAnchor, kind }
    : { tourId, activeAnchor };
}
