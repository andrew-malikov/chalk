import { tokens } from "@canvas/styles/tokens.stylex";
import type { ReviewDiffFileWire } from "@chalk/review-contracts";
import * as stylex from "@stylexjs/stylex";
import { ArrowRight, CircleSmall, File, Minus, Plus } from "lucide-react";
import type { ReactElement } from "react";

// Added and deleted take the two change colors, modified the warn amber the
// diagrams use, renamed ink-muted, referenced context a ghost file outline.
const styles = stylex.create({
  mark: {
    flex: "none",
    width: "16px",
    height: "16px",
    fill: "none",
    stroke: "currentcolor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  dot: {
    fill: "currentcolor",
    stroke: "none",
  },
  added: { color: tokens.changeAdded },
  deleted: { color: tokens.changeRemoved },
  modified: { color: tokens.changeModified },
  renamed: { color: tokens.inkMuted },
  unchanged: { color: tokens.ghost },
});

const MARK_ICONS = {
  added: Plus,
  deleted: Minus,
  modified: CircleSmall,
  renamed: ArrowRight,
  unchanged: File,
};

/** A file's status beside its name, using the corresponding change color. */
export function FileMark({
  status,
}: {
  status: ReviewDiffFileWire["status"];
}): ReactElement {
  const Icon = MARK_ICONS[status];

  return (
    <Icon
      {...stylex.props(
        styles.mark,
        styles[status],
        status === "modified" && styles.dot,
      )}
      aria-hidden="true"
      focusable="false"
    />
  );
}
