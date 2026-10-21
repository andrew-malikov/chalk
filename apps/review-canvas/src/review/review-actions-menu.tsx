import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@canvas/components/ui/dropdown-menu";
import { useAnchoredPopover } from "@canvas/lib/use-anchored-popover";
import { cn } from "@canvas/lib/utils";
import { topbarActionsMarker } from "@canvas/styles/markers";
import { shellStyles } from "@canvas/styles/shell-styles";
import { useTutorial } from "@canvas/tutorial/tutorial-context";
import { copyText } from "@canvas/ui/copy-text";
import { CheckIcon, CopyIcon } from "@canvas/ui/icons";
import { surfaceStyles } from "@canvas/ui/surface";
import { Archive, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";

import { useReviewActions } from "./review-context";

/** The review's ⋯ menu: copy its id, settle it, and the host's delete. */
export function ReviewActionsMenu({
  chalkId,
  settleable,
  deletable,
  onDelete,
  overlay,
}: {
  chalkId: string;
  /** Whether the review can still be settled (or the tutorial closed). */
  settleable: boolean;
  deletable: boolean;
  onDelete?: () => Promise<void>;
  /** Where the menu renders when a host's chrome holds the trigger. */
  overlay?: HTMLElement;
}): ReactElement {
  const { dismissReview } = useReviewActions();
  const tutorial = useTutorial();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const control = useRef<HTMLDivElement>(null);
  const errorPopover = useAnchoredPopover<HTMLSpanElement>(failed, control);

  const settle = async () => {
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

  // The marker lets the error popover anchor here, inside a host's chrome too.
  return (
    <div
      ref={control}
      className={cn(shellStyles.topbarItem, styles.action, topbarActionsMarker)}
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <ButtonPrimitive
            variant="ghost"
            size="icon-sm"
            aria-label="Review actions"
            aria-busy={busy || undefined}
            disabled={busy}
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </ButtonPrimitive>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          container={overlay}
          align="end"
          className="tw:min-w-[180px] tw:font-[family-name:var(--chrome-font)]"
        >
          <DropdownMenuItem onSelect={() => void copyText(chalkId)}>
            <CopyIcon />
            Copy Chalk ID
          </DropdownMenuItem>
          {/* The tutorial is not in the review store, so there is no list to
              leave: closing the tab is the whole action. */}
          {settleable &&
            (tutorial ? (
              <DropdownMenuItem onSelect={tutorial.close}>
                <Archive aria-hidden="true" />
                Close tutorial
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => void settle()}>
                <CheckIcon />
                Settle review
              </DropdownMenuItem>
            ))}
          {deletable && onDelete && !tutorial && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={styles.destructive}
                onSelect={() => void onDelete()}
              >
                <Trash2Icon aria-hidden="true" />
                Delete review…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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

const styles = {
  action: "tw:relative tw:inline-flex tw:items-center",
  destructive:
    "tw:text-[color:var(--change-removed)] tw:focus:text-[color:var(--change-removed)]",
  error:
    "tw:p-[8px_12px] tw:text-[color:var(--change-removed)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[normal] tw:whitespace-nowrap",
};
