import type { CoverageProgress } from "@review/viewed-coverage";
import * as stylex from "@stylexjs/stylex";
import { CheckIcon, MinusIcon } from "lucide-react";

import { radius } from "./scale.stylex";
import { tokens } from "./tokens.stylex";
import { useTooltip } from "./use-tooltip";

/** Shared viewed checkbox for lenses, file lists and diff headers. */
export function ViewedButton({
  progress,
  onClick,
  disabled,
  label,
}: {
  progress: CoverageProgress;
  onClick(): void;
  disabled?: boolean;
  /** What the box marks, e.g. the lens title. */
  label: string;
}) {
  const done = progress.state === "viewed";
  const empty = progress.total.additions + progress.total.deletions === 0;

  const tooltip = useTooltip(
    done
      ? "Click to mark as unviewed"
      : progress.state === "partial"
        ? "Click to mark all as viewed"
        : "Click to mark as viewed",
    { instant: true },
  );

  return (
    <button
      ref={empty ? undefined : tooltip}
      type="button"
      {...stylex.props(styles.button, empty && styles.empty)}
      role="checkbox"
      aria-checked={progress.state === "partial" ? "mixed" : done}
      aria-label={`${done ? "Mark unviewed" : "Mark viewed"}: ${label}`}
      disabled={disabled || empty}
      onClick={onClick}
    >
      <span {...stylex.props(styles.box, done && styles.viewed)}>
        {done ? (
          <CheckIcon size={14} aria-hidden="true" />
        ) : progress.state === "partial" ? (
          <MinusIcon size={14} aria-hidden="true" />
        ) : null}
      </span>
    </button>
  );
}

const styles = stylex.create({
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: 28,
    height: 28,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.small,
    backgroundColor: { default: "transparent", ":hover": tokens.well },
    color: tokens.inkMuted,
    cursor: "pointer",
    outline: { default: null, ":focus-visible": `2px solid ${tokens.accent}` },
    outlineOffset: 2,
  },
  box: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    width: 16,
    height: 16,
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: "currentColor",
    borderRadius: radius.small,
  },
  viewed: { color: tokens.accent },
  empty: { visibility: "hidden" },
});
