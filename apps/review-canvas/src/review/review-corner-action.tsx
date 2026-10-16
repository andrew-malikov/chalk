import { useAnchoredPopover } from "@canvas/lib/use-anchored-popover";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { fontSize, fontWeight } from "@canvas/styles/scale.stylex";
import { shellStyles } from "@canvas/styles/shell-styles";
import { tokens } from "@canvas/styles/tokens.stylex";
import { useTutorial } from "@canvas/tutorial/tutorial-context";
import { Button, IconButton } from "@canvas/ui/button";
import type { IconProps } from "@canvas/ui/icons";
import { surfaceStyles } from "@canvas/ui/surface";
import * as stylex from "@stylexjs/stylex";
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
      <div {...stylex.props(shellStyles.topbarItem, styles.action)}>
        <Button ref={closeTooltip} onClick={tutorial.close}>
          <ArchiveIcon xstyle={styles.icon} />
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
    <div ref={control} {...stylex.props(shellStyles.topbarItem, styles.action)}>
      <IconButton
        ref={settleTooltip}
        aria-label="Settle review"
        loading={busy}
        onClick={() => void dismiss()}
      >
        <ArchiveIcon xstyle={styles.icon} />
      </IconButton>
      {failed && (
        <span
          ref={errorPopover}
          popover="manual"
          {...stylex.props(
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

export function ArchiveIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Archive
      {...stylex.props(xstyle)}
      size={13}
      aria-hidden="true"
      focusable="false"
    />
  );
}

// The single end-of-review control, sized to fit inside the topbar.
// Settling is terminal but reversible, so it is a quiet icon rather than a
// destructive fill. It never uses a bare X: that reads as "close".
const styles = stylex.create({
  action: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
  },
  icon: {
    fill: "none",
    stroke: "currentcolor",
    strokeWidth: "1.3",
    strokeLinejoin: "round",
  },
  // Only rendered in the topbar, where the popover placement positions it.
  error: {
    padding: "8px 12px",
    color: tokens.changeRemoved,
    font: `${fontWeight.regular} ${fontSize.small} ${tokens.fontSans}`,
    whiteSpace: "nowrap",
  },
});
