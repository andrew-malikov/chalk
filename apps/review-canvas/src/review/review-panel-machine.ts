import {
  type ReviewCommitSummary,
  type ReviewView,
  reviewViewSchema,
} from "@chalk/review-contracts";
import { type ActorRefFrom, type SnapshotFrom, assign, setup } from "xstate";

import type { PeekPanel, ReviewPanelMotion } from "./review-panel-model";
import { shouldCloseSidePeekForReviewView } from "./review-view-route";

export interface ReviewPanelState {
  /** The peek in the side panel. */
  active: PeekPanel | null;
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
  /** Views the canvas offers; navigation to any other lands on "review". */
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
  | { type: "openPeek"; panel: PeekPanel }
  | { type: "close" }
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
    viewUnavailable: ({ context }, { view }: { view: ReviewView }) =>
      !context.availableViews.includes(view),
  },
});

export function createReviewPanelMachine({
  view = "review",
  availableViews = reviewViewSchema.options,
  diffScope = null,
  lens = null,
  overlayTour = null,
}: ReviewNavigationRestore = {}) {
  const initialView = availableViews.includes(view) ? view : "review";

  return panelSetup.createMachine({
    id: "reviewPanel",
    initial: initialView,
    context: {
      active: null,
      motion: "live",
      availableViews,
      diffScope: initialView === "diff" ? diffScope : null,
      lens,
      mapFocus: null,
      overlayTour: initialView === "review" ? overlayTour : null,
    },
    states: {
      review: {},
      commits: {
        always: {
          guard: { type: "viewUnavailable", params: { view: "commits" } },
          target: "review",
          actions: { type: "navigate", params: { view: "review" } },
        },
      },
      diff: {
        always: {
          guard: { type: "viewUnavailable", params: { view: "diff" } },
          target: "review",
          actions: { type: "navigate", params: { view: "review" } },
        },
      },
      map: {
        always: {
          guard: { type: "viewUnavailable", params: { view: "map" } },
          target: "review",
          actions: { type: "navigate", params: { view: "review" } },
        },
      },
    },
    on: {
      suppressMotion: { actions: assign({ motion: "restored" }) },
      openPeek: {
        actions: assign(({ event }) => ({
          active: event.panel,
          motion: "live",
        })),
      },
      close: { actions: assign({ active: null, motion: "live" }) },
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
          active: context.active,
          motion: context.motion,
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

function viewTransition(
  state: ReviewPanelContext,
  requested: ReviewView,
): Partial<ReviewPanelContext> {
  const view = state.availableViews.includes(requested) ? requested : "review";

  return {
    ...(view !== "diff" && { diffScope: null }),
    ...(view !== "map" &&
      state.mapFocus?.pending && {
        mapFocus: { ...state.mapFocus, pending: false },
      }),
    ...(view !== "review" && state.overlayTour && { overlayTour: null }),
    ...(shouldCloseSidePeekForReviewView(view) &&
      state.active && {
        active: null,
        motion: "live",
      }),
  };
}
