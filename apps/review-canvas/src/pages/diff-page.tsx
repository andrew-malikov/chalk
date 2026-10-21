import { useComments } from "@canvas/comments/comments-context";
import { CommentsPanel } from "@canvas/comments/comments-panel";
import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canvas/components/ui/popover";
import { DiffSettingsControl } from "@canvas/diff/diff-settings";
import { DiffNavigationSlot, ReviewDiffView } from "@canvas/diff/DiffView";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { cn } from "@canvas/lib/utils";
import {
  useReviewPanel,
  useReviewPanelActor,
} from "@canvas/review/review-panel";
import { controlStyles } from "@canvas/styles/controls-styles";
import { scopedDiffMarker } from "@canvas/styles/markers";
import { shellStyles } from "@canvas/styles/shell-styles";
import { IconButton } from "@canvas/ui/button";
import { ChatIcon } from "@canvas/ui/icons";
import type { ReviewCommitSummary } from "@chalk/review-contracts";
import { ArrowLeft } from "lucide-react";
import { type ReactElement, useLayoutEffect, useRef, useState } from "react";

import { PageToolbar, usePageSlots } from "./page-slots";

export function DiffPage({ active }: { active: boolean }): ReactElement {
  const panelActor = useReviewPanelActor();
  const diffScope = useReviewPanel((state) => state.context.diffScope);
  const activePanel = useReviewPanel((state) => state.context.active);
  const comments = useComments();
  const slots = usePageSlots();
  const commentsTooltip = useTooltip("Comments");

  const commentsShown = !!comments?.open && activePanel === null;

  // The full diff stays mounted while another view shows, at the width it
  // had when it was hidden: following the column through a side peek's
  // resize would lay out every editor in it on each step. Shown, it fills the
  // column again and lays out once.
  const diffHostRef = useRef<HTMLDivElement | null>(null);
  const diffPreloaded = !active || diffScope !== null;
  // Built the first time it is shown, then kept for instant returns.
  const [diffOpened, setDiffOpened] = useState(!diffPreloaded);

  if (!diffPreloaded && !diffOpened) setDiffOpened(true);

  const [frozenDiffWidth, setFrozenDiffWidth] = useState<number>();

  useLayoutEffect(() => {
    const width = diffHostRef.current?.getBoundingClientRect().width;

    setFrozenDiffWidth(diffPreloaded && width ? width : undefined);
  }, [diffPreloaded]);

  const frozenDiffStyle =
    diffPreloaded && frozenDiffWidth
      ? { right: "auto", width: `${frozenDiffWidth}px` }
      : undefined;

  return (
    <>
      {active && (
        <PageToolbar>
          <DiffSettingsControl />
          {comments && (
            <Popover open={commentsShown} onOpenChange={comments.toggle}>
              <PopoverTrigger asChild>
                <IconButton
                  ref={commentsTooltip}
                  className={[
                    shellStyles.topbarItem,
                    "tw:aria-expanded:bg-accent tw:aria-expanded:text-accent-foreground",
                  ]}
                  aria-label="Comments"
                >
                  <ChatIcon className={controlStyles.chromeIcon} />
                </IconButton>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                aria-label="Comments"
                className={styles.comments}
              >
                <CommentsPanel />
              </PopoverContent>
            </Popover>
          )}
        </PageToolbar>
      )}
      <div
        ref={diffHostRef}
        aria-hidden={diffPreloaded}
        className={cn(
          shellStyles.diffView,
          diffPreloaded && shellStyles.diffViewPreloaded,
        )}
        style={frozenDiffStyle}
      >
        {diffOpened && (
          <DiffNavigationSlot.Provider
            value={diffPreloaded ? null : (slots?.toolbarStart ?? null)}
          >
            <ReviewDiffView />
          </DiffNavigationSlot.Provider>
        )}
      </div>
      {active && diffScope !== null && (
        <div
          className={cn(
            "review-diff-view--scoped",
            shellStyles.diffView,
            shellStyles.diffViewScoped,
            scopedDiffMarker,
          )}
        >
          <CommitDiffScopeBar
            commit={diffScope.commit}
            onBack={() =>
              panelActor.send({ type: "showView", view: "commits" })
            }
          />
          <ReviewDiffView
            scope={{ commit: diffScope.commit.commit }}
            revealFile={diffScope.file}
            restoreFile={diffScope.restoreFile}
          />
        </div>
      )}
    </>
  );
}

function CommitDiffScopeBar({
  commit,
  onBack,
}: {
  commit: ReviewCommitSummary;
  onBack: () => void;
}) {
  return (
    <div className={scopeBarStyles.bar}>
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        type="button"
        className={scopeBarStyles.back}
        onClick={onBack}
      >
        <ArrowLeft size={12} aria-hidden="true" /> Commits
      </ButtonPrimitive>
      <code className={scopeBarStyles.sha} title={commit.commit}>
        {commit.commit.slice(0, 8)}
      </code>
      <span
        className={cn(
          scopeBarStyles.subject,
          !commit.subject && scopeBarStyles.subjectMissing,
        )}
        title={commit.subject || undefined}
      >
        {commit.subject || "No commit message"}
      </span>
    </div>
  );
}

const styles = {
  comments:
    "tw:w-[440px] tw:max-w-[calc(100vw-24px)] tw:max-h-[min(640px,var(--radix-popover-content-available-height))] tw:overflow-x-hidden tw:overflow-y-auto tw:overscroll-contain tw:p-0",
};

const scopeBarStyles = {
  bar: "tw:flex tw:h-[30px] tw:flex-[0_0_30px] tw:items-center tw:gap-[12px] tw:p-[0_12px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule-soft)] tw:bg-[color:var(--surface)]",
  back: "tw:h-[20px] tw:flex-[0_0_auto] tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:transparent] tw:text-[color:var(--accent)] tw:text-[length:10px]",
  sha: "tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-mono)] tw:text-[length:10px] tw:font-normal tw:leading-[normal]",
  subject:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--ink)] tw:text-[length:11px] tw:text-ellipsis tw:whitespace-nowrap",
  subjectMissing: "tw:text-[color:var(--ink-muted)] tw:italic",
};
