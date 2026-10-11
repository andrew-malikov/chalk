import type { ReviewView } from "@dev.fast/review-protocol";

export type { ReviewView } from "@dev.fast/review-protocol";

/** The views a canvas offers, in switcher order. */
export function offeredReviewViews({
  hasChangeRange,
  softwareMapEnabled,
}: {
  hasChangeRange: boolean;
  softwareMapEnabled: boolean;
}): readonly ReviewView[] {
  return [
    "review",
    ...(hasChangeRange ? (["commits", "diff"] as const) : []),
    ...(softwareMapEnabled ? (["map"] as const) : []),
  ];
}

export function reviewViewLabel(view: ReviewView): string {
  if (view === "map") return "Map";

  if (view === "diff") return "Diff";

  if (view === "commits") return "Commits";

  return "Blackboard";
}

export function shouldCloseSidePeekForReviewView(view: ReviewView): boolean {
  return view !== "review";
}
