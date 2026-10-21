import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { countLabel } from "@canvas/home/review-home-view";
import { useReviewSession } from "@canvas/host/review-session";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { cn } from "@canvas/lib/utils";
import { canvasQueryKeys } from "@canvas/review/canvas-query";
import { shortRef } from "@canvas/review/review-branch-range";
import { controlStyles } from "@canvas/styles/controls-styles";
import { chevronMarker } from "@canvas/styles/markers";
import { IconButton } from "@canvas/ui/button";
import { CopyButton } from "@canvas/ui/copy-text";
import { CodeIcon, DisclosureChevron } from "@canvas/ui/icons";
import { textStyles } from "@canvas/ui/text";
import {
  type ReviewCommitSummary,
  type ReviewDiffFileWire,
} from "@chalk/review-contracts";
import { FileDiff } from "@pierre/diffs/react";
import { useQuery } from "@tanstack/react-query";
import { CircleSmall } from "lucide-react";
import { useMemo, useState } from "react";

import { useReviewTheme } from "./PierreDiffView";
import { DiffCount } from "./diff-count";
import { useDiffPreference } from "./diff-settings";
import { FileMark } from "./file-mark";
import { loadPierreComparison, loadPierreFile } from "./pierre-comparison";

type OpenCommitDiff = (commit: ReviewCommitSummary, file?: string) => void;

export function ReviewCommitsView({
  commits,
  range,
  onOpenDiff,
}: {
  commits: readonly ReviewCommitSummary[];
  range: import("@chalk/review-contracts").ReviewCanvasRange;
  onOpenDiff: OpenCommitDiff;
}) {
  if (range.sourceUnavailable) return null;

  return (
    <div className={styles.view}>
      <div className={styles.column}>
        <header className={styles.range}>
          <strong className={styles.rangeCount}>
            {countLabel(commits.length, "commit")}
          </strong>
          <span
            className={styles.rangeRefs}
            title={`${range.baseCommit}..${range.headCommit}`}
          >
            {shortRef(range.baseRef || range.baseCommit)} →{" "}
            {shortRef(range.headRef || range.headCommit)}
          </span>
        </header>
        <CommitGroups commits={commits} onOpenDiff={onOpenDiff} />
      </div>
    </div>
  );
}

function CommitGroups({
  commits,
  onOpenDiff,
}: {
  commits: readonly ReviewCommitSummary[];
  onOpenDiff: OpenCommitDiff;
}) {
  const groups = useMemo(() => groupCommitsByDate(commits), [commits]);

  return groups.map((group, index) => (
    <section key={group.key}>
      <div className={cn(styles.date, index > 0 && styles.laterDate)}>
        <CircleSmall className={styles.dateIcon} aria-hidden="true" />
        <h2 className={cn(textStyles.eyebrow, styles.dateHeading)}>
          Commits on {group.label}
        </h2>
      </div>
      <div className={styles.timeline}>
        {group.commits.map((commit) => (
          <CommitRow
            key={commit.commit}
            commit={commit}
            onOpenDiff={onOpenDiff}
          />
        ))}
      </div>
      {index === groups.length - 1 && (
        <CircleSmall className={styles.endIcon} aria-hidden="true" />
      )}
    </section>
  ));
}

function CommitRow({
  commit,
  onOpenDiff,
}: {
  commit: ReviewCommitSummary;
  onOpenDiff: OpenCommitDiff;
}) {
  const session = useReviewSession();
  const [expanded, setExpanded] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [openFiles, setOpenFiles] = useState<ReadonlySet<string>>(new Set());
  const openTooltip = useTooltip("Open commit diff");

  // A commit's files never change.
  const files = useQuery({
    queryKey: canvasQueryKeys.commitFiles(commit.commit),
    queryFn: async () => [
      ...(await session.bridge.diffView.files({ commit: commit.commit })),
    ],
    enabled: expanded,
    staleTime: Infinity,
  });

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
  };

  const visibleFiles = files.data ? visibleCommitFiles(files.data) : null;

  const omittedFileCount = visibleFiles
    ? visibleFiles.testFilesOmitted + visibleFiles.overflowFilesOmitted
    : 0;

  // Omitted files append below the ranked ones, so the rows already read stay
  // put.
  const shownFiles =
    visibleFiles && showAllFiles
      ? [
          ...visibleFiles.files,
          ...files.data!.filter((file) => !visibleFiles.files.includes(file)),
        ]
      : visibleFiles?.files;

  const toggleFile = (path: string) =>
    setOpenFiles((open) => {
      const next = new Set(open);

      if (!next.delete(path)) next.add(path);

      return next;
    });

  return (
    <article className={cn(styles.card, expanded && styles.cardExpanded)}>
      <div className={cn(styles.header, expanded && styles.headerExpanded)}>
        <ButtonPrimitive
          variant="ghost"
          size="xs"
          type="button"
          className={cn(chevronMarker, styles.toggle)}
          aria-expanded={expanded}
          onClick={toggleExpanded}
          title={commit.subject || undefined}
        >
          <DisclosureChevron expanded={expanded} className={styles.chevron} />
          <strong
            className={cn(
              styles.subject,
              !commit.subject && styles.subjectMissing,
            )}
          >
            {commit.subject || "No commit message"}
          </strong>
        </ButtonPrimitive>
        <span className={styles.actions}>
          <span className={styles.sha}>{commit.commit.slice(0, 8)}</span>
          <CopyButton
            text={commit.commit}
            label="Copy commit SHA"
            iconClassName={controlStyles.chromeIcon}
          />
          <IconButton
            ref={openTooltip}
            className="review-commit-open"
            aria-label="Open commit diff"
            onClick={() => onOpenDiff(commit)}
          >
            <CodeIcon className={controlStyles.chromeIcon} />
          </IconButton>
        </span>
        <span className={styles.meta}>
          {commit.author} · {formatCommitTime(commit.authoredAt)} ·{" "}
          {countLabel(commit.fileCount, "file")}{" "}
          <DiffCount
            additions={commit.additions}
            deletions={commit.deletions}
          />
        </span>
      </div>
      {expanded ? (
        <div className={styles.files}>
          {files.isPending ? (
            <p className={styles.filesNote}>Loading files…</p>
          ) : null}
          {files.isError ? (
            <p className={styles.filesNote}>{files.error.message}</p>
          ) : null}
          {shownFiles?.map((file) => (
            <div key={file.path}>
              <ButtonPrimitive
                variant="ghost"
                size="xs"
                type="button"
                className={styles.file}
                aria-expanded={openFiles.has(file.path)}
                onClick={() => toggleFile(file.path)}
              >
                <FileMark status={file.status} />
                <span className={styles.filePath}>{file.path}</span>
                <DiffCount
                  additions={file.additions}
                  deletions={file.deletions}
                />
              </ButtonPrimitive>
              {openFiles.has(file.path) ? (
                <CommitFileDiff commit={commit.commit} file={file} />
              ) : null}
            </div>
          ))}
          {omittedFileCount > 0 && !showAllFiles ? (
            <ButtonPrimitive
              variant="ghost"
              size="xs"
              type="button"
              className={styles.filesFooter}
              onClick={() => setShowAllFiles(true)}
            >
              {countLabel(omittedFileCount, "more file")}
            </ButtonPrimitive>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function CommitFileDiff({
  commit,
  file,
}: {
  commit: string;
  file: ReviewDiffFileWire;
}) {
  const session = useReviewSession();
  const theme = useReviewTheme();
  const [layout] = useDiffPreference("layout");
  const [wrap] = useDiffPreference("wrap");

  const url = useMemo(() => {
    const url = new URL(session.apiUrl("/diff"));
    url.searchParams.set("commit", commit);

    return url.href;
  }, [session.apiUrl, commit]);

  // A commit's patch never changes.
  const entry = useQuery({
    queryKey: canvasQueryKeys.commitFileDiff(commit, file.path),
    queryFn: async ({ signal }) =>
      (
        await loadPierreComparison({
          files: [file],
          url,
          signal,
          request: session.fetchUrl,
          onUpdate: () => {},
        })
      )[0]!,
    staleTime: Infinity,
  });

  // Pierre hydrates metadata in place; each mounted viewer owns its copy.
  const diff = useMemo(
    () => entry.data?.diff && structuredClone(entry.data.diff),
    [entry.data],
  );

  if (!diff)
    return (
      <p className={styles.filesNote}>
        {entry.error?.message ??
          entry.data?.error ??
          entry.data?.notice ??
          "Loading diff…"}
      </p>
    );

  return (
    <FileDiff
      fileDiff={diff}
      className={styles.fileDiff}
      options={{
        diffStyle: layout,
        hunkSeparators: "line-info",
        theme: theme === "light" ? "pierre-light" : "pierre-dark",
        themeType: theme,
        preferredHighlighter: "shiki-js",
        overflow: wrap ? "wrap" : "scroll",
        disableFileHeader: true,
        unsafeCSS:
          ":host{--diffs-font-family:var(--font-mono,monospace);--diffs-font-size:12px;--diffs-line-height:20px;--diffs-bg:var(--surface);--diffs-fg:var(--ink)}",
        loadDiffFiles: (diff) =>
          loadPierreFile(
            diff,
            url,
            session.fetchUrl,
            new AbortController().signal,
          ),
      }}
    />
  );
}

export interface VisibleCommitFiles {
  files: ReviewDiffFileWire[];
  testFilesOmitted: number;
  overflowFilesOmitted: number;
}

export function visibleCommitFiles(
  files: readonly ReviewDiffFileWire[],
): VisibleCommitFiles {
  const visible = files.filter((file) => !isTestFile(file.path));
  visible.sort(
    (left, right) =>
      right.additions + right.deletions - (left.additions + left.deletions) ||
      left.path.localeCompare(right.path),
  );

  return {
    files: visible.slice(0, 8),
    testFilesOmitted: files.length - visible.length,
    overflowFilesOmitted: Math.max(0, visible.length - 8),
  };
}

function isTestFile(path: string): boolean {
  return (
    path.includes("/__tests__/") ||
    /(^|\/)__tests__\//u.test(path) ||
    /\.(test|spec)\.[^/]+$/u.test(path)
  );
}

export function groupCommitsByDate(commits: readonly ReviewCommitSummary[]) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const groups: Array<{
    key: string;
    label: string;
    commits: ReviewCommitSummary[];
  }> = [];

  const orderedCommits = [...commits].sort(
    (left, right) => Date.parse(right.authoredAt) - Date.parse(left.authoredAt),
  );

  for (const commit of orderedCommits) {
    const date = new Date(commit.authoredAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const previous = groups.at(-1);

    if (previous?.key === key) {
      previous.commits.push(commit);
    } else {
      groups.push({
        key,
        label: formatter.format(date).toUpperCase(),
        commits: [commit],
      });
    }
  }

  return groups;
}

function formatCommitTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const styles = {
  view: "tw:min-h-full tw:p-[32px_24px] tw:[@media_(max-width:_760px)]:p-[24px_16px]",
  column: "tw:w-[min(760px,_100%)] tw:m-[0_auto]",
  range: "tw:flex tw:items-baseline tw:gap-[12px] tw:pb-[16px]",
  rangeCount:
    "tw:text-[color:var(--ink)] tw:shrink-0 tw:font-[family-name:var(--font-sans)] tw:text-[length:15px] tw:font-semibold tw:leading-[20px] tw:whitespace-nowrap",
  rangeRefs:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-mono)] tw:text-[length:11px] tw:font-normal tw:leading-[normal] tw:text-ellipsis tw:whitespace-nowrap",
  date: "tw:flex tw:items-center tw:gap-[10px] tw:p-[8px_0]",
  laterDate: "tw:pt-[10px]",
  dateIcon:
    "tw:size-[14px] tw:flex-[0_0_14px] tw:fill-[none] tw:stroke-[var(--ink-faint)] tw:stroke-[1.5]",
  dateHeading: "tw:m-0",
  endIcon:
    "tw:block tw:size-[14px] tw:fill-[none] tw:stroke-[var(--ink-faint)] tw:stroke-[1.5]",
  timeline:
    "tw:relative tw:ml-[6px] tw:pl-[22px] tw:[&::before]:absolute tw:[&::before]:top-[-8px] tw:[&::before]:bottom-0 tw:[&::before]:left-0 tw:[&::before]:w-[1px] tw:[&::before]:bg-[color:var(--rule-soft)] tw:[&::before]:[content:'']",
  card: "tw:mb-[6px] tw:overflow-hidden tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[10px] tw:bg-[color:var(--surface)] tw:[box-shadow:none]",
  cardExpanded: "tw:border-[color:var(--rule-soft)]",
  // Subject over who, when and how much; the commit's actions centered at
  // the right. The toggle's hit area covers the whole header, under the
  // actions, so the header draws its focus ring.
  header:
    "tw:relative tw:grid tw:items-center tw:p-[10px_12px] tw:gap-[4px_12px] tw:grid-cols-[minmax(0,_1fr)_auto] tw:[&:hover]:bg-[color:var(--control-bg)] tw:[&:has(.canvas-chevron:focus-visible)]:[box-shadow:inset_0_0_0_1px_var(--accent)]",
  headerExpanded:
    "tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule-soft)]",
  toggle:
    "tw:has-[>svg]:px-0 tw:flex tw:justify-start tw:min-w-0 tw:items-center tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:transparent] tw:hover:bg-transparent tw:dark:hover:bg-transparent tw:text-[color:inherit] tw:gap-[10px] tw:text-left tw:[&:focus-visible]:[outline:none] tw:[&::after]:absolute tw:[&::after]:inset-0 tw:[&::after]:[content:'']",
  subject:
    "tw:overflow-hidden tw:text-[color:var(--ink)] tw:text-[length:12px] tw:font-medium tw:text-ellipsis tw:whitespace-nowrap",
  subjectMissing: "tw:text-[color:var(--ink-muted)] tw:italic",
  actions:
    "tw:relative tw:flex tw:items-center tw:gap-[2px] tw:[grid-column:2] tw:[grid-row:1_/_3]",
  sha: "tw:mr-[6px] tw:text-[color:var(--ink-faint)] tw:font-[family-name:var(--font-mono)] tw:text-[length:11px] tw:font-normal tw:leading-[normal] tw:tabular-nums",
  meta: "tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[normal] tw:tabular-nums tw:pl-[26px] tw:text-[color:var(--ink-muted)]",
  files: "tw:p-[6px_0]",
  filesNote:
    "tw:m-[6px_12px] tw:text-[color:var(--ink-faint)] tw:text-[length:11px]",
  file: "tw:flex tw:w-full tw:items-center tw:gap-[10px] tw:p-[6px_12px] tw:rounded-none tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:transparent] tw:[&:hover]:bg-[color:var(--control-bg)] tw:text-[color:var(--ink)] tw:text-[length:11px] tw:text-left",
  filePath:
    "tw:min-w-0 tw:flex-[1] tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",
  fileDiff: "tw:block tw:my-[4px]",
  filesFooter:
    "tw:w-full tw:justify-start tw:p-[6px_12px_4px_38px] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:transparent] tw:text-[color:var(--ink-faint)] tw:[&:hover]:text-[color:var(--accent)] tw:text-[length:10px]",
  // The whole header is the toggle's hit area, so its chevron stays quiet on
  // hover.
  chevron:
    "tw:size-[16px] tw:m-0 tw:text-[color:var(--ink-faint)] tw:[&:is(.canvas-chevron:focus-visible:not(:hover)_*)]:text-[color:var(--ink)]",
};
