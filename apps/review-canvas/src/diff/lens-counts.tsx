import { cn } from "@canvas/lib/utils";
import { CheckIcon } from "@canvas/ui/icons";
import type { CoverageProgress } from "@review/documents/viewed-coverage";

import { compactDiffCount as compact, diffCountStyles } from "./diff-count";

/** The same counts for an HTML caption, outside SVG text. */
export function ElementCountsText({
  progress,
}: {
  progress: CoverageProgress;
}) {
  return progress.state === "viewed" ? (
    <span aria-label="Viewed">
      <CheckIcon />
    </span>
  ) : progress.state === "folded" ? (
    <span>Folded</span>
  ) : (
    <>
      <span className={cn(diffCountStyles.added, styles.added)}>
        +{compact(progress.remaining.additions)}
      </span>{" "}
      <span className={cn(diffCountStyles.removed, styles.removed)}>
        −{compact(progress.remaining.deletions)}
      </span>
    </>
  );
}

// Flow node captions.
const styles = {
  added: "tw:fill-[var(--change-added)]",
  removed: "tw:fill-[var(--change-removed)]",
};
