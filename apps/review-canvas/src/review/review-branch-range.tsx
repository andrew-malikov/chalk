import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { cn } from "@canvas/lib/utils";
import { copyText } from "@canvas/ui/copy-text";
import { type ReactElement, useEffect, useRef, useState } from "react";

const fullHash = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

/** A branch name as is; a full commit hash cut to its first eight digits. */
export function shortRef(ref: string): string {
  return fullHash.test(ref) ? ref.slice(0, 8) : ref;
}

/** A head that is the checkout's working files, not a commit. */
export const WORKING_TREE = Symbol("working tree");

/**
 * The pinned commit range as two copyable chips, `base ← head`: the arrow
 * points from the head commit into the base it is compared against. A
 * working-tree head has no commit to copy, so it is a plain label.
 */
export function ReviewBranchRange({
  baseRef,
  headRef,
}: {
  baseRef: string;
  headRef: string | typeof WORKING_TREE;
}): ReactElement {
  const [copied, setCopied] = useState<"base" | "head" | null>(null);

  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = async (side: "base" | "head", ref: string) => {
    if (!(await copyText(ref))) return;
    clearTimeout(resetTimer.current);
    setCopied(side);
    resetTimer.current = setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div
      className={styles.range}
      role="group"
      aria-label={`Session commits: base ${shortRef(baseRef)}, head ${
        headRef === WORKING_TREE ? "working tree" : shortRef(headRef)
      }`}
    >
      <BranchRef
        label="base"
        name={baseRef}
        copied={copied === "base"}
        onCopy={() => void copy("base", baseRef)}
      />
      <span className={styles.arrow} aria-hidden="true">
        ←
      </span>
      {headRef === WORKING_TREE ? (
        <WorkingTreeRef />
      ) : (
        <BranchRef
          label="head"
          name={headRef}
          copied={copied === "head"}
          onCopy={() => void copy("head", headRef)}
        />
      )}
    </div>
  );
}

function BranchRef({
  label,
  name,
  copied,
  onCopy,
}: {
  label: "base" | "head";
  name: string;
  copied: boolean;
  onCopy: () => void;
}): ReactElement {
  const tooltip = useTooltip(`${label} ${name}`, { detail: "Click to copy" });

  return (
    <ButtonPrimitive
      variant="ghost"
      size="xs"
      type="button"
      className={cn(
        styles.chip,
        styles.copy,
        label === "base" && styles.copyBase,
      )}
      data-side={label}
      data-copied={copied || undefined}
      aria-label={`Copy ${label} commit hash ${name}`}
      ref={tooltip}
      onClick={onCopy}
    >
      <span className={cn(styles.name, copied && styles.nameCopied)}>
        {shortRef(name)}
      </span>
      <span className={styles.feedback} role="status">
        {copied ? "Copied" : ""}
      </span>
    </ButtonPrimitive>
  );
}

function WorkingTreeRef(): ReactElement {
  const tooltip = useTooltip<HTMLSpanElement>("head Working tree", {
    detail: "Saved files in the checkout, including uncommitted changes",
  });

  return (
    <span
      className={cn(styles.chip, styles.worktree)}
      data-side="head"
      ref={tooltip}
    >
      Working tree
    </span>
  );
}

const styles = {
  range:
    "tw:flex tw:min-w-0 tw:items-center tw:gap-[6px] tw:text-[color:inherit] tw:whitespace-nowrap",
  // Each pinned commit is a small mono chip that copies its full hash; a
  // working-tree head wears the same chip but has nothing to copy.
  chip: "tw:relative tw:inline-flex tw:min-w-0 tw:items-center tw:m-0 tw:p-[0_6px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[4px] tw:bg-[color:var(--tray)] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:12px] tw:font-normal tw:leading-[18px] tw:cursor-pointer",
  copy: "tw:bg-[color:var(--tray)] tw:[&:hover]:bg-[color:var(--chrome-hover-bg)] tw:[&:focus-visible]:bg-[color:var(--chrome-hover-bg)] tw:[&:hover]:[outline:none] tw:[&:focus-visible]:[outline:none] tw:border-[color:var(--rule)] tw:[&:focus-visible]:border-[color:var(--accent)]",
  copyBase:
    "tw:text-[color:var(--ink-muted)] tw:[&:hover]:text-[color:var(--ink)] tw:[&:focus-visible]:text-[color:var(--ink)]",
  worktree: "tw:cursor-default",
  name: "tw:max-w-[150px] tw:overflow-hidden tw:text-ellipsis",
  nameCopied: "tw:invisible",
  feedback: "tw:absolute tw:inset-0 tw:grid tw:place-items-center",
  arrow: "tw:text-[color:var(--ink-faint)]",
};
