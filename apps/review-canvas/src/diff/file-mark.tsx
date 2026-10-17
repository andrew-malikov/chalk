import { cn } from "@canvas/lib/utils";
import type { ReviewDiffFileWire } from "@chalk/review-contracts";
import { ArrowRight, CircleSmall, File, Minus, Plus } from "lucide-react";
import type { ReactElement } from "react";

// Added and deleted take the two change colors, modified the warn amber the
// diagrams use, renamed ink-muted, referenced context a ghost file outline.
const styles = {
  mark: "tw:flex-[none] tw:size-[16px] tw:fill-[none] tw:stroke-[currentcolor] tw:stroke-[1.5] tw:[stroke-linecap:round] tw:[stroke-linejoin:round]",
  dot: "tw:fill-[currentcolor] tw:stroke-[none]",
  added: "tw:text-[color:var(--change-added)]",
  deleted: "tw:text-[color:var(--change-removed)]",
  modified: "tw:text-[color:var(--change-modified)]",
  renamed: "tw:text-[color:var(--ink-muted)]",
  unchanged: "tw:text-[color:var(--ghost)]",
};

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
      className={cn(
        styles.mark,
        styles[status],
        status === "modified" && styles.dot,
      )}
      aria-hidden="true"
      focusable="false"
    />
  );
}
