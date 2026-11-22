import type { ReviewView } from "@chalk/review-contracts";

export type { ReviewView } from "@chalk/review-contracts";

/** The views a canvas offers, in switcher order. */
export function offeredReviewViews({
  hasDocument,
  hasChangeRange,
  softwareMapEnabled,
}: {
  hasDocument: boolean;
  hasChangeRange: boolean;
  softwareMapEnabled: boolean;
}): readonly ReviewView[] {
  return [
    // A bare MR import has no Chalk page until an agent writes one.
    ...(hasDocument || !hasChangeRange ? (["review"] as const) : []),
    ...(hasChangeRange ? (["commits", "diff"] as const) : []),
    ...(softwareMapEnabled ? (["map"] as const) : []),
  ];
}

export function reviewViewLabel(view: ReviewView): string {
  if (view === "map") return "Map";

  if (view === "diff") return "Diff";

  if (view === "commits") return "Commits";

  return "Chalk";
}
