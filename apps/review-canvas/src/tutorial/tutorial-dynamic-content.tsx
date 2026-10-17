import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { cn } from "@canvas/lib/utils";
import { useReviewActions } from "@canvas/review/review-context";
import type { ReviewComponentProps } from "@review/documents/authoring";
import { ArrowRight } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { useTutorial } from "./tutorial-context";
import {
  tutorialFeatureVisible,
  tutorialViewVisible,
} from "./tutorial-render-visibility";

type TutorialViewButtonProps = ReviewComponentProps<"TutorialViewButton"> & {
  children?: ReactNode;
};

export function TutorialFeature({
  children,
}: ReviewComponentProps<"TutorialFeature"> & {
  children?: ReactNode;
}): ReactElement | null {
  const tutorial = useTutorial();
  const { softwareMapEnabled } = useReviewActions();

  if (
    !tutorialFeatureVisible({ tutorial: tutorial !== null, softwareMapEnabled })
  )
    return null;

  return <>{children}</>;
}

export function TutorialViewButton({
  view,
  children,
}: ReviewComponentProps<"TutorialViewButton"> & {
  children?: ReactNode;
}): ReactElement | null {
  const tutorial = useTutorial();
  const { softwareMapEnabled } = useReviewActions();

  if (
    !tutorialViewVisible(
      { tutorial: tutorial !== null, softwareMapEnabled },
      view,
    )
  )
    return null;

  // The class is the tutorial's target.
  return (
    <ButtonPrimitive
      variant="ghost"
      size="xs"
      type="button"
      className={cn("tutorial-view-button", styles.button)}
      data-tutorial-view={view}
      onClick={() => openReviewView(view)}
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        focusable="false"
        className={styles.arrow}
      />
    </ButtonPrimitive>
  );
}

function openReviewView(view: TutorialViewButtonProps["view"]): void {
  const ariaLabel = view === "map" ? "Map (Experimental)" : viewLabel(view);
  document
    .querySelector<HTMLButtonElement>(
      `.review-segment[aria-label="${ariaLabel}"]`,
    )
    ?.click();
}

function viewLabel(view: TutorialViewButtonProps["view"]): string {
  return view.charAt(0).toUpperCase() + view.slice(1);
}

// A row action is marker text with an ink-faint arrow, never a box; boxes are
// for controls that act on the page.
const styles = {
  button:
    "tw:inline-flex tw:items-center tw:gap-[6px] tw:m-[6px_0_12px] tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:var(--transparent)] tw:text-[color:var(--accent)] tw:cursor-pointer tw:font-[family-name:var(--font-sans)] tw:text-[length:12px] tw:font-normal tw:leading-[normal] tw:[&:hover]:[text-decoration:underline]",
  arrow: "tw:size-[14px] tw:shrink-0 tw:text-[color:var(--ink-faint)]",
};
