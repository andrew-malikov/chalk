import { Checkbox } from "@canvas/components/ui/checkbox";
import { useTooltip } from "@canvas/lib/use-tooltip";
import type { CoverageProgress } from "@review/documents/viewed-coverage";
import { useId } from "react";

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
  const id = useId();
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
    <label
      htmlFor={id}
      className={`tw:inline-flex tw:size-7 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-sm tw:hover:bg-muted ${empty ? "tw:invisible" : ""}`}
    >
      <Checkbox
        id={id}
        ref={empty ? undefined : tooltip}
        aria-label={`${done ? "Mark unviewed" : "Mark viewed"}: ${label}`}
        checked={progress.state === "partial" ? "indeterminate" : done}
        disabled={disabled || empty}
        onClick={onClick}
      />
    </label>
  );
}
