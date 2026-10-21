import { DiffCount } from "@canvas/diff/diff-count";
import { drawStyles } from "@canvas/drawing/draw-styles";
import { useReviewSession } from "@canvas/host/review-session";
import { cn } from "@canvas/lib/utils";
import { DisplayedReviewVersionContext } from "@canvas/review/displayed-review-version-context";
import {
  ReviewBranchRange,
  WORKING_TREE,
} from "@canvas/review/review-branch-range";
import { useReviewDiffFiles } from "@canvas/review/review-diff-files-context";
import {
  type ReviewDiffStats,
  summarizeReviewDiffFiles,
} from "@chalk/review-contracts";
import { GitBranch } from "lucide-react";
import {
  Fragment,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Automatic document header: update time above the title,
 * with one row of facts below it: saved branch, diff statistics and the
 * commit range, separated by dots.
 */
export function ReviewDocumentMetaLine({
  children,
}: {
  children?: ReactNode;
}): ReactElement {
  const session = useReviewSession();
  const displayedVersion = useContext(DisplayedReviewVersionContext);
  const diffFiles = useReviewDiffFiles();

  const review = session.review!;

  const [relativeTimeNowMs, setRelativeTimeNowMs] = useState<number | null>(
    null,
  );

  useEffect(() => {
    setRelativeTimeNowMs(Date.now());
  }, [displayedVersion]);

  const diff =
    diffFiles.status === "loaded" ? reviewDiffStats(diffFiles) : null;

  const updatedLabel =
    review.updatedAtMs != null && relativeTimeNowMs != null
      ? relativeTimeLabel(review.updatedAtMs, relativeTimeNowMs)
      : null;

  const branch = review.headBranch?.trim() ? review.headBranch : null;

  const facts: { key: string; node: ReactNode }[] = [];

  if (branch) {
    facts.push({
      key: "branch",
      node: (
        <span className={styles.branch} title={`Head branch: ${branch}`}>
          <GitBranch
            size={13}
            aria-hidden="true"
            className={cn(styles.icon, styles.branchIcon)}
          />
          <span className={styles.branchName}>{branch}</span>
        </span>
      ),
    });
  }

  if (diff && review.pins) {
    facts.push({
      key: "files",
      node: (
        <span>
          {diff.fileCount === 1 ? "1 file" : `${diff.fileCount} files`}
        </span>
      ),
    });
    facts.push({
      key: "changes",
      node: (
        <span className={cn(styles.row, styles.stats)}>
          <DiffCount
            additions={diff.additions}
            deletions={diff.deletions}
            large
          />
          {diff.additions + diff.deletions > 0 ? (
            <span className={styles.changeBar} aria-hidden="true">
              {diff.additions > 0 ? (
                <span
                  className={styles.change}
                  style={{ flexGrow: diff.additions }}
                />
              ) : null}
              {diff.deletions > 0 ? (
                <span
                  className={cn(styles.change, styles.removed)}
                  style={{ flexGrow: diff.deletions }}
                />
              ) : null}
            </span>
          ) : null}
        </span>
      ),
    });
  }

  if (review.pins) {
    facts.push({
      key: "range",
      node: (
        <ReviewBranchRange
          baseRef={review.pins.base}
          headRef={
            review.targetKind === "worktree" ? WORKING_TREE : review.pins.head
          }
        />
      ),
    });
  }

  return (
    // The attribute is a marker for tests.
    <header
      className={cn(styles.header, drawStyles.blockChild)}
      data-review-document-header
    >
      <div className={cn(styles.row, styles.top)} data-review-copy-ignore>
        {updatedLabel && (
          <span className={styles.updated}>Updated {updatedLabel}</span>
        )}
      </div>
      {children}
      <div className={cn(styles.row, styles.details)} data-review-copy-ignore>
        {withFactDots(facts)}
      </div>
    </header>
  );
}

/** Lay out header facts with a small dot between each present pair. */
function withFactDots(
  facts: readonly { key: string; node: ReactNode }[],
): ReactNode {
  return facts.map(({ key, node }, index) => (
    <Fragment key={key}>
      {index > 0 ? <span className={styles.dot} aria-hidden="true" /> : null}
      {node}
    </Fragment>
  ));
}

function reviewDiffStats(diff: {
  files?: { additions?: number; deletions?: number }[];
}): ReviewDiffStats | null {
  if (!diff.files?.length) return null;

  return summarizeReviewDiffFiles(diff.files);
}

function relativeTimeLabel(timeMs: number, nowMs: number): string | null {
  if (!Number.isFinite(timeMs)) return null;
  const seconds = Math.max(0, Math.round((nowMs - timeMs) / 1000));

  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);

  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);

  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);

  if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;

  return new Date(timeMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// Paper's review header: identity, title, then source and diff metadata.
const styles = {
  header:
    "tw:w-[min(100%,_var(--review-prose-max-width))] tw:m-[28px_auto_0] tw:flex tw:flex-col tw:gap-[12px] tw:pb-[28px] tw:font-[family-name:var(--font-sans)] tw:text-[length:13px] tw:font-normal tw:leading-[18px] tw:text-[color:var(--ink-faint)]",
  row: "tw:flex tw:items-center tw:flex-wrap",
  top: "tw:justify-between tw:gap-[10px_24px]",
  updated: "tw:ml-[auto]",
  icon: "tw:shrink-0 tw:fill-[none] tw:stroke-[currentColor] tw:stroke-[1.8] tw:[stroke-linecap:round] tw:[stroke-linejoin:round]",
  // Facts in the details row are divided by small ink-faint dots.
  details: "tw:gap-[8px_10px] tw:pt-[12px]",
  dot: "tw:flex-[0_0_3px] tw:size-[3px] tw:rounded-[50%] tw:bg-[color:var(--ink-faint)]",
  branch:
    "tw:inline-flex tw:items-center tw:gap-[7px] tw:box-border tw:min-w-0 tw:min-h-[26px] tw:max-w-full tw:p-[3px_10px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[8px] tw:bg-[color:var(--well)] tw:text-[color:var(--ink)] tw:[overflow-wrap:anywhere]",
  branchIcon: "tw:text-[color:var(--ink-faint)]",
  branchName: "tw:min-w-0 tw:[overflow-wrap:anywhere]",
  stats: "tw:gap-[10px] tw:flex-nowrap tw:shrink-0",
  changeBar: "tw:flex tw:flex-[0_0_42px] tw:w-[42px] tw:gap-[2px] tw:h-[8px]",
  change: "tw:min-w-[1px] tw:rounded-[2px] tw:bg-[color:var(--change-added)]",
  removed: "tw:bg-[color:var(--change-removed)]",
};
