import { useAnchoredPopover } from "@canvas/lib/use-anchored-popover";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { cn } from "@canvas/lib/utils";
import { shellStyles } from "@canvas/styles/shell-styles";
import { useTutorial } from "@canvas/tutorial/tutorial-context";
import { Button, IconButton } from "@canvas/ui/button";
import type { IconProps } from "@canvas/ui/icons";
import { surfaceStyles } from "@canvas/ui/surface";
import { Archive } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";

import { useReviewActions, useReviewState } from "./review-context";

export function ReviewCornerAction(): ReactElement | null {
  const { dismissReview } = useReviewActions();
  const { submissionOutcome } = useReviewState();
  const tutorial = useTutorial();

  const closeTooltip = useTooltip("Close tutorial");
  const settleTooltip = useTooltip("Settle review");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const control = useRef<HTMLDivElement>(null);
  const errorPopover = useAnchoredPopover<HTMLSpanElement>(failed, control);

  // A finished review has nothing left to submit or dismiss.
  if (submissionOutcome === "dismissed") return null;

  /* The tutorial is not in the review store, so there is no list to leave.
     Closing the tab is the whole action, and it needs no
     confirmation. */
  if (tutorial) {
    return (
      <div className={cn(shellStyles.topbarItem, styles.action)}>
        <Button ref={closeTooltip} onClick={tutorial.close}>
          <ArchiveIcon className={styles.icon} />
          <span>Close</span>
        </Button>
      </div>
    );
  }

  const dismiss = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);

    try {
      await dismissReview();
    } catch (error) {
      console.error("Review action failed", error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={control} className={cn(shellStyles.topbarItem, styles.action)}>
      <IconButton
        ref={settleTooltip}
        aria-label="Settle review"
        loading={busy}
        onClick={() => void dismiss()}
      >
        <ArchiveIcon className={styles.icon} />
      </IconButton>
      {failed && (
        <span
          ref={errorPopover}
          popover="manual"
          className={cn(
            shellStyles.topbarPopover,
            surfaceStyles.popover,
            styles.error,
          )}
          role="alert"
        >
          Could not settle the review. Try again.
        </span>
      )}
    </div>
  );
}

export function ArchiveIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Archive
      className={cn(className)}
      size={13}
      aria-hidden="true"
      focusable="false"
    />
  );
}

// The single end-of-review control, sized to fit inside the topbar.
// Settling is terminal but reversible, so it is a quiet icon rather than a
// destructive fill. It never uses a bare X: that reads as "close".
const styles = {
  action: "tw:relative tw:inline-flex tw:items-center",
  icon: "tw:fill-[none] tw:stroke-[currentcolor] tw:stroke-[1.3] tw:[stroke-linejoin:round]",
  // Only rendered in the topbar, where the popover placement positions it.
  error:
    "tw:p-[8px_12px] tw:text-[color:var(--change-removed)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[normal] tw:whitespace-nowrap",
};
