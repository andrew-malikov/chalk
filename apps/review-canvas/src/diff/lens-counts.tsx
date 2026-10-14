import { tokens } from "@canvas/styles/tokens.stylex";
import { CheckIcon } from "@canvas/ui/icons";
import type { CoverageProgress } from "@review/documents/viewed-coverage";
import * as stylex from "@stylexjs/stylex";

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
      <span {...stylex.props(diffCountStyles.added, styles.added)}>
        +{compact(progress.remaining.additions)}
      </span>{" "}
      <span {...stylex.props(diffCountStyles.removed, styles.removed)}>
        −{compact(progress.remaining.deletions)}
      </span>
    </>
  );
}

// Flow node captions.
const styles = stylex.create({
  added: {
    fill: tokens.changeAdded,
  },
  removed: {
    fill: tokens.changeRemoved,
  },
});
