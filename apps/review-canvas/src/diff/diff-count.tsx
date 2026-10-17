import { cn } from "@canvas/lib/utils";
import type { ReactElement } from "react";

export const compactDiffCount = (count: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
    .format(count)
    .toLowerCase();

/**
 * The one way a +n −n pair is written anywhere in the app: the add and
 * delete tokens, tabular mono at 11px, compact past 999. Cards, meta lines,
 * commit rows, lens rows and the progress line all render this.
 */
export function DiffCount({
  additions,
  deletions,
  large = false,
}: {
  additions: number;
  deletions: number;
  /** The review header's size. */
  large?: boolean;
}): ReactElement {
  return (
    <span className={cn(diffCountStyles.counts, large && styles.large)}>
      <span className={diffCountStyles.added}>
        +{compactDiffCount(additions)}
      </span>
      <span className={diffCountStyles.removed}>
        −{compactDiffCount(deletions)}
      </span>
    </span>
  );
}

export const diffCountStyles = {
  counts:
    "tw:inline-flex tw:gap-[6px] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[normal] tw:tabular-nums tw:whitespace-nowrap tw:text-[length:11px]",
  added: "tw:text-[color:var(--change-added)]",
  removed: "tw:text-[color:var(--change-removed)]",
};

const styles = {
  large: "tw:text-[length:13px] tw:gap-[10px]",
};
