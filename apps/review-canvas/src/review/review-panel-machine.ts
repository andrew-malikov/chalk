import {
  type ReviewCommitSummary,
  type ReviewView,
  reviewViewSchema,
} from "@chalk/review-contracts";
import { type ActorRefFrom, type SnapshotFrom, assign, setup } from "xstate";

import type { ReviewPanelMotion } from "./review-panel-model";

export interface ReviewPanelState {
  motion: ReviewPanelMotion;
}

/** A lens applies only to the version and diff mode it was chosen on. */
export interface ReviewLensSelection {
  id: string;
  version: number;
  mode: "structural" | "textual";
}

export interface ReviewDiffScope {
  commit: ReviewCommitSummary;
  file?: string;
  /** `file` came from a reload; a saved diff position wins over it. */
  restoreFile?: boolean;
}

export interface MapFocus {
  requestId: number;
  elementPath: string;
  /** Cleared once the map has selected the element, so remounts don't replay it. */
  pending: boolean;
}

export type OverlayTourKind = "sequence" | "database" | "flow";

/** A fullscreen diagram tour. `kind` is absent on one restored from an
 * older build's in-panel record. */
export interface OverlayTour {
  tourId: string;
  kind?: OverlayTourKind;
  anchor: string;
  revealRequest: number;
}

/** Which canvas view is showing and what it is scoped to. */
export interface ReviewNavigationState {
  view: ReviewView;
  /** Views the canvas offers; navigation to any other lands on the Chalk page, else the Diff. */
  availableViews: readonly ReviewView[];
  diffScope: ReviewDiffScope | null;

  /** null reads the configured default. */
  lens: ReviewLensSelection | null;
  mapFocus: MapFocus | null;
  overlayTour: OverlayTour | null;
}

export type ReviewNavigationRestore = Partial<
  Pick<
    ReviewNavigationState,
    "view" | "availableViews" | "diffScope" | "lens" | "overlayTour"
  >
>;

type ReviewPanelContext = ReviewPanelState &
  Omit<ReviewNavigationState, "view">;

export type ReviewPanelEvent =
  | { type: "suppressMotion" }
  | { type: "showView"; view: ReviewView }
  | { type: "openCommitDiff"; scope: ReviewDiffScope }
  | { type: "selectLens"; lens: ReviewLensSelection }
  | { type: "clearLens" }
  | { type: "setAvailableViews"; views: readonly ReviewView[] }
  | { type: "focusMapElement"; elementPath: string }
  | { type: "consumeMapFocus"; requestId: number }
  | {
      type: "openOverlayTour";
      tour: { tourId: string; kind: OverlayTourKind };
      anchor: string;
    }
  | { type: "moveOverlayTour"; anchor: string; reveal: boolean }
  | { type: "closeOverlayTour" };

const panelSetup = setup({
  types: {
    // SAFETY: XState reads `context` only for type inference.
    context: {} as ReviewPanelContext,
    // SAFETY: XState reads `events` only for type inference.
    events: {} as ReviewPanelEvent,
  },
  actions: {
    navigate: assign(({ context }, { view }: { view: ReviewView }) =>
      viewTransition(context, view),
    ),
  },
  guards: {
    fallsBack: (
      { context },
      { from, to }: { from: ReviewView; to: ReviewView },
    ) =>
      !context.availableViews.includes(from) &&
      fallbackView(context.availableViews) === to,
  },
});

export function createReviewPanelMachine({
  view = "review",
  availableViews = reviewViewSchema.options,
  diffScope = null,
  lens = null,
  overlayTour = null,
}: ReviewNavigationRestore = {}) {
  const initialView = availableViews.includes(view)
    ? view
    : fallbackView(availableViews);

  return panelSetup.createMachine({
    id: "reviewPanel",
    initial: initialView,
    context: {
      motion: "live",
      availableViews,
      diffScope: initialView === "diff" ? diffScope : null,
      lens,
      mapFocus: null,
      overlayTour: initialView === "review" ? overlayTour : null,
    },
    states: {
      review: { always: fallback("review") },
      commits: { always: fallback("commits") },
      diff: { always: fallback("diff") },
      map: { always: fallback("map") },
    },
    on: {
      suppressMotion: { actions: assign({ motion: "restored" }) },
      showView: [
        {
          guard: ({ event }) => event.view === "commits",
          target: ".commits",
          actions: { type: "navigate", params: { view: "commits" } },
        },
        {
          guard: ({ event }) => event.view === "diff",
          target: ".diff",
          actions: { type: "navigate", params: { view: "diff" } },
        },
        {
          guard: ({ event }) => event.view === "map",
          target: ".map",
          actions: { type: "navigate", params: { view: "map" } },
        },
        {
          target: ".review",
          actions: { type: "navigate", params: { view: "review" } },
        },
      ],
      openCommitDiff: {
        target: ".diff",
        actions: assign(({ context, event }) => ({
          ...viewTransition(context, "diff"),
          diffScope: context.availableViews.includes("diff")
            ? event.scope
            : null,
        })),
      },
      selectLens: {
        target: ".diff",
        actions: assign(({ context, event }) => ({
          ...viewTransition(context, "diff"),
          lens: event.lens,
          diffScope: null,
        })),
      },
      clearLens: { actions: assign({ lens: null }) },
      setAvailableViews: {
        actions: assign(({ event }) => ({ availableViews: event.views })),
      },
      focusMapElement: {
        guard: ({ context }) => context.availableViews.includes("map"),
        target: ".map",
        actions: assign(({ context, event }) => ({
          ...viewTransition(context, "map"),
          mapFocus: {
            requestId: (context.mapFocus?.requestId ?? 0) + 1,
            elementPath: event.elementPath,
            pending: true,
          },
        })),
      },
      consumeMapFocus: {
        guard: ({ context, event }) =>
          context.mapFocus?.requestId === event.requestId &&
          context.mapFocus.pending,
        actions: assign(({ context }) => ({
          mapFocus: context.mapFocus && { ...context.mapFocus, pending: false },
        })),
      },
      openOverlayTour: {
        actions: assign(({ context, event }) => ({
          motion: "live",
          overlayTour: {
            ...event.tour,
            anchor: event.anchor,
            // The mounted panel needs a new reveal when the tour changes.
            revealRequest: (context.overlayTour?.revealRequest ?? 0) + 1,
          },
        })),
      },
      moveOverlayTour: {
        guard: ({ context }) => context.overlayTour !== null,
        actions: assign(({ context, event }) => ({
          overlayTour: context.overlayTour && {
            ...context.overlayTour,
            anchor: event.anchor,
            revealRequest:
              context.overlayTour.revealRequest + Number(event.reveal),
          },
        })),
      },
      closeOverlayTour: { actions: assign({ overlayTour: null }) },
    },
  });
}

export type ReviewPanelActor = ActorRefFrom<
  ReturnType<typeof createReviewPanelMachine>
>;

export type ReviewPanelSnapshot = SnapshotFrom<ReviewPanelActor>;

// The Chalk page leads; a review without one opens on its Diff.
function fallbackView(views: readonly ReviewView[]): ReviewView {
  return (
    (["review", "diff"] as const).find((view) => views.includes(view)) ??
    views[0] ??
    "review"
  );
}

/** Leaves an unavailable view for the fallback view. */
function fallback(from: ReviewView) {
  return reviewViewSchema.options
    .filter((to) => to !== from)
    .map((to) => ({
      guard: { type: "fallsBack" as const, params: { from, to } },
      target: to,
      actions: { type: "navigate" as const, params: { view: to } },
    }));
}

function viewTransition(
  state: ReviewPanelContext,
  requested: ReviewView,
): Partial<ReviewPanelContext> {
  const view = state.availableViews.includes(requested)
    ? requested
    : fallbackView(state.availableViews);

  return {
    ...(view !== "diff" && { diffScope: null }),
    ...(view !== "map" &&
      state.mapFocus?.pending && {
        mapFocus: { ...state.mapFocus, pending: false },
      }),
    ...(view !== "review" && state.overlayTour && { overlayTour: null }),
  };
}
