import { NativeSelect } from "@canvas/components/ui/native-select";
import { fontSize } from "@canvas/scale.stylex";
import { Button, IconButton } from "@canvas/ui/button";
import type {
  ReviewCommitScope,
  ReviewDiffFileWire,
  ReviewDiffLens,
  ReviewDiffProgress,
} from "@dev.fast/review-protocol";
import { isJsonObject } from "@dev.fast/review-protocol";
import type {
  CodeViewItem,
  CodeViewLineSelection,
  FileDiffMetadata,
  NumericScrollLineAnchor,
} from "@pierre/diffs";
import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  WrapTextIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { useAgentSelection } from "../agent-selection";
import { DiffCount } from "../diff-count";
import { useReviewSession } from "../host/review-session";
import { useReviewDiffFiles } from "../review-diff-files-context";
import {
  readReviewUiState,
  useReviewUiState,
  writeReviewUiState,
} from "../review-ui-state";
import { tokens } from "../tokens.stylex";
import { ViewedButton } from "../viewed-button";
import {
  type PierreComparisonEntry,
  loadPierreComparison,
  loadPierreFile,
} from "./pierre-comparison";
import { selectedPierreDiff } from "./pierre-selection";

interface Props {
  scope?: ReviewCommitScope;
  revealFile?: string;
  restoreFile?: boolean;
  lens?: ReviewDiffLens;
  treeContainer?: HTMLElement;
  progress?: ReviewDiffProgress;
  onToggleViewed?(path: string): void;
  hidden?: boolean;
  inWorkspace?: boolean;
}

interface SavedView {
  collapsed: string[];
  anchor?: { id: string; line?: NumericScrollLineAnchor; offset: number };
}

export function PierreDiffView(props: Props) {
  const [structural, setStructural] = useReviewUiState(
    "diff-structural",
    false,
  );

  const session = useReviewSession();
  const summary = useReviewDiffFiles();
  const revision = props.scope ? undefined : summary.revision;
  const sourceIdentity = JSON.stringify([
    session.review?.pins,
    session.review?.targetKind,
    session.review?.historicalRevision,
    props.scope?.commit,
  ]);
  const comparisonUrl = useMemo(() => {
    const url = new URL(session.apiUrl("/diff"));
    if (props.scope) url.searchParams.set("commit", props.scope.commit);
    return url.href;
  }, [session.apiUrl, sourceIdentity]);
  const scopedSummary = useQuery<ReviewDiffFileWire[]>({
    queryKey: ["pierre-commit-files", comparisonUrl],
    enabled: !!props.scope,
    queryFn: async ({ signal }) => {
      const response = await session.fetchUrl(comparisonUrl, { signal });
      if (!response.ok)
        throw new Error(`Cannot load changed files (${response.status})`);
      return response.json();
    },
    staleTime: Infinity,
    gcTime: 0,
  });
  const files = props.scope
    ? scopedSummary.data
    : summary.status === "loaded"
      ? summary.files
      : undefined;
  const error = props.scope
    ? scopedSummary.error?.message
    : summary.status === "error"
      ? summary.error
      : undefined;
  if (error)
    return (
      <p {...stylex.props(styles.notice)} role="alert">
        {error}
      </p>
    );
  if (!files)
    return (
      <p {...stylex.props(styles.notice)} role="status">
        Loading changed files…
      </p>
    );
  return (
    <Comparison
      key={`${comparisonUrl}:${revision ?? ""}:${props.lens?.id ?? "all"}:${structural}`}
      {...props}
      files={files}
      url={comparisonUrl}
      revision={revision}
      structural={structural}
      setStructural={setStructural}
    />
  );
}

function Comparison({
  files,
  url,
  revision,
  scope,
  lens,
  treeContainer,
  progress,
  onToggleViewed,
  revealFile,
  restoreFile,
  hidden,
  inWorkspace,
  structural,
  setStructural,
}: Props & {
  files: readonly ReviewDiffFileWire[];
  url: string;
  revision?: string;
  structural: boolean;
  setStructural(value: boolean): void;
}) {
  const session = useReviewSession();
  const queryClient = useQueryClient();
  const select = useAgentSelection();
  const preferred = useRef(revealFile);
  preferred.current = revealFile;
  const queryKey = useMemo(
    () => [
      "pierre-comparison",
      url,
      revision,
      JSON.stringify(files),
      structural,
    ],
    [url, revision, files, structural],
  );
  const comparison = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      loadPierreComparison({
        files,
        url,
        signal,
        request: session.fetchUrl,
        structural,
        preferredFile: () => preferred.current,
        onUpdate: (entries) => queryClient.setQueryData(queryKey, entries),
      }),
    staleTime: Infinity,
    gcTime: 0,
  });
  const entries =
    comparison.data ?? files.map((file): PierreComparisonEntry => ({ file }));
  const allowed = lens
    ? new Set(lens.ranges.map((range) => range.file))
    : undefined;
  const visible = allowed
    ? entries.filter(
        (entry) =>
          allowed.has(entry.file.path) ||
          (!!entry.file.previousPath && allowed.has(entry.file.previousPath)),
      )
    : entries;
  const stateKey = session.storageKey(
    "pierre-diff-view",
    JSON.stringify([
      session.review?.pins,
      session.review?.historicalRevision,
      scope?.commit ?? "review",
      lens?.id ?? "all",
      structural,
    ]),
  );
  const saved = useRef(readSavedView(stateKey));
  const [collapsed, setCollapsed] = useState(
    () => new Set(saved.current.collapsed),
  );
  const [selectedPath, setSelectedPath] = useState(
    revealFile ?? visible[0]?.file.path,
  );
  const [selection, setSelection] = useState<CodeViewLineSelection | null>(
    null,
  );
  const [wrap, setWrap] = useReviewUiState("diff-wrap", false);
  // Pierre hydrates metadata in place; each mounted viewer owns its copy.
  const renderedDiffs = useRef(
    new WeakMap<FileDiffMetadata, FileDiffMetadata>(),
  );
  const viewer = useRef<CodeViewHandle<undefined, undefined>>(null);
  const container = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restored = useRef(false);
  const pendingReveal = useRef(
    revealFile && !(restoreFile && saved.current.anchor?.id === revealFile)
      ? revealFile
      : undefined,
  );
  const pendingRange = useRef(
    !saved.current.anchor && !lens?.wholeFiles ? lens?.ranges[0] : undefined,
  );
  const layout = useSyncExternalStore(
    useCallback(
      (notify) => {
        const subscription = session.bridge.onDidChangeDiffLayout(notify);
        return () => subscription.dispose();
      },
      [session.bridge],
    ),
    () => session.bridge.currentDiffLayout(),
  );
  const theme = useSyncExternalStore(
    useCallback(
      (notify) => {
        const subscription = session.bridge.onDidChangeTheme(notify);
        return () => subscription.dispose();
      },
      [session.bridge],
    ),
    () => session.theme(),
  );
  const items = useMemo<CodeViewItem<undefined>[]>(
    () =>
      visible.flatMap((entry) => {
        if (!entry.diff) return [];
        let diff = renderedDiffs.current.get(entry.diff);
        if (!diff) {
          diff = structuredClone(entry.diff);
          renderedDiffs.current.set(entry.diff, diff);
        }
        return [
          {
            id: entry.file.path,
            type: "diff" as const,
            fileDiff: diff,
            version: Number(collapsed.has(entry.file.path)),
            collapsed: collapsed.has(entry.file.path),
          },
        ];
      }),
    [visible, collapsed],
  );
  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => writeReviewUiState("session", stateKey, saved.current),
      200,
    );
  }, [stateKey]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      writeReviewUiState("session", stateKey, saved.current);
      select(null);
    },
    [stateKey, select],
  );
  const navigate = useCallback(
    (path: string) => {
      setSelectedPath(path);
      pendingReveal.current = path;
      setCollapsed((current) => {
        if (!current.has(path)) return current;
        const next = new Set(current);
        next.delete(path);
        saved.current.collapsed = [...next];
        save();
        return next;
      });
      viewer.current?.scrollTo({ type: "item", id: path, align: "start" });
    },
    [save],
  );
  const previousReveal = useRef(revealFile);
  useEffect(() => {
    if (previousReveal.current === revealFile) return;
    previousReveal.current = revealFile;
    if (revealFile) navigate(revealFile);
  }, [revealFile, navigate]);
  const restore = useCallback(() => {
    if (hidden) return;
    const instance = viewer.current?.getInstance();
    const reveal = pendingReveal.current;
    if (reveal && instance?.getTopForItem(reveal) !== undefined) {
      pendingReveal.current = undefined;
      restored.current = true;
      viewer.current!.scrollTo({
        type: "item",
        id: reveal,
        align: "start",
        behavior: "instant",
      });
      return;
    }
    const range = pendingRange.current;
    if (range) {
      const entry = files.find(
        (file) => file.path === range.file || file.previousPath === range.file,
      );
      if (entry && instance?.getTopForItem(entry.path) !== undefined) {
        const rendered = instance
          .getRenderedItems()
          .find((item) => item.id === entry.path);
        if (!rendered) {
          viewer.current!.scrollTo({
            type: "item",
            id: entry.path,
            align: "start",
            behavior: "instant",
          });
          return;
        }
        pendingRange.current = undefined;
        restored.current = true;
        const side = range.side === "base" ? "deletions" : "additions";
        viewer.current!.scrollTo(
          rendered?.instance.getLinePosition(range.fromLine, side)
            ? {
                type: "line",
                id: entry.path,
                lineNumber: range.fromLine,
                side,
                align: "start",
                behavior: "instant",
              }
            : {
                type: "item",
                id: entry.path,
                align: "start",
                behavior: "instant",
              },
        );
        return;
      }
    }
    if (restored.current) return;
    const anchor = saved.current.anchor;
    if (!anchor) {
      restored.current = true;
      return;
    }
    if (instance?.getTopForItem(anchor.id) === undefined) {
      if (!comparison.isFetching) restored.current = true;
      return;
    }
    restored.current = true;
    viewer.current!.scrollTo(
      anchor.line
        ? {
            type: "line",
            id: anchor.id,
            lineNumber: anchor.line.lineNumber,
            side: anchor.line.side,
            align: "start",
            offset: anchor.offset,
            behavior: "instant",
          }
        : {
            type: "item",
            id: anchor.id,
            align: "start",
            offset: anchor.offset,
            behavior: "instant",
          },
    );
  }, [files, comparison.isFetching, hidden]);
  useLayoutEffect(restore, [restore, items, hidden]);
  const committed =
    !!scope ||
    session.review?.targetKind !== "worktree" ||
    session.review?.historicalRevision !== null;
  const sourceRequests = useMemo(() => new Set<AbortController>(), [url]);
  useEffect(
    () => () => {
      for (const request of sourceRequests) request.abort();
      sourceRequests.clear();
    },
    [sourceRequests],
  );
  const options = useMemo(
    () => ({
      diffStyle: layout,
      hunkSeparators:
        committed || structural ? ("line-info" as const) : ("simple" as const),
      theme: theme === "light" ? "pierre-light" : "pierre-dark",
      themeType: theme === "light" ? ("light" as const) : ("dark" as const),
      preferredHighlighter: "shiki-js" as const,
      enableLineSelection: true,
      overflow: wrap ? ("wrap" as const) : ("scroll" as const),
      stickyHeaders: true,
      unsafeCSS:
        ":host{--diffs-font-family:var(--font-mono,monospace);--diffs-font-size:12px;--diffs-line-height:20px;--diffs-bg:var(--surface);--diffs-fg:var(--ink)}",
      onPostRender: restore,
      loadDiffFiles:
        committed && !structural
          ? (diff: Parameters<typeof loadPierreFile>[0]) => {
              const request = new AbortController();
              sourceRequests.add(request);

              return loadPierreFile(
                diff,
                url,
                session.fetchUrl,
                request.signal,
              ).finally(() => sourceRequests.delete(request));
            }
          : undefined,
    }),
    [
      layout,
      theme,
      wrap,
      session.fetchUrl,
      committed,
      url,
      sourceRequests,
      restore,
      structural,
    ],
  );
  const fileProgress = new Map(
    progress?.files.map((file) => [file.path, file]),
  );
  function viewed(path: string) {
    const file = fileProgress.get(path);
    if (!file || !onToggleViewed) return null;
    return (
      <ViewedButton
        label={path}
        progress={{
          total: file.total,
          remaining: file.remaining,
          state: file.state,
          folded: { additions: 0, deletions: 0 },
        }}
        onClick={() => onToggleViewed(path)}
      />
    );
  }
  const chosen = visible.find((entry) => entry.file.path === selectedPath);
  const openSource = (file: ReviewDiffFileWire) =>
    session.surface.revealAnchor(
      file.status === "deleted" ? (file.previousPath ?? file.path) : file.path,
      { fromLine: 1, toLine: 1 },
      file.status === "deleted" ? "base" : "head",
      undefined,
      scope,
    );
  return (
    <div
      {...stylex.props(styles.root, inWorkspace && styles.workspace)}
      ref={container}
      style={hidden ? { display: "none" } : undefined}
      data-pierre-diff="true"
      data-pierre-status={comparison.isFetching ? "loading" : "ready"}
      data-accepted-patch-bytes={entries.reduce(
        (total, entry) => total + (entry.diff ? (entry.bytes ?? 0) : 0),
        0,
      )}
      data-rejected-files={entries.filter((entry) => entry.error).length}
    >
      <div
        {...stylex.props(styles.toolbar)}
        role="toolbar"
        aria-label="Diff display"
      >
        {lens && (
          <span {...stylex.props(styles.lensNotice)}>
            Showing full file diffs for this lens
          </span>
        )}
        {structural && chosen?.diff?.hunks.some((hunk) => hunk.hunkContext) && (
          <div {...stylex.props(styles.functionPicker)}>
            <NativeSelect
              size="sm"
              aria-label="Changed functions"
              value=""
              onChange={(event) => {
                const hunk = chosen.diff!.hunks[Number(event.target.value)];
                if (!hunk) return;
                viewer.current?.scrollTo({
                  type: "line",
                  id: chosen.file.path,
                  lineNumber: hunk.additionCount
                    ? hunk.additionStart
                    : hunk.deletionStart,
                  side: hunk.additionCount ? "additions" : "deletions",
                  align: "start",
                });
              }}
            >
              <option value="" disabled>
                Changed functions
              </option>
              {chosen.diff.hunks.map(
                (hunk, index) =>
                  hunk.hunkContext && (
                    <option key={index} value={index}>
                      {hunk.hunkContext}
                    </option>
                  ),
              )}
            </NativeSelect>
          </div>
        )}
        <div {...stylex.props(styles.modePicker)}>
          <NativeSelect
            size="sm"
            aria-label="Diff mode"
            value={structural ? "structural" : "text"}
            onChange={(event) =>
              setStructural(event.target.value === "structural")
            }
            title="Group code changes by function and ignore formatting-only edits"
          >
            <option value="text">Text diff</option>
            <option value="structural">Structural diff</option>
          </NativeSelect>
        </div>
        <Button
          variant="secondary"
          xstyle={[styles.wrapButton, wrap && styles.wrapActive]}
          aria-pressed={wrap}
          onClick={() => setWrap(!wrap)}
        >
          <WrapTextIcon aria-hidden="true" />
          Wrap lines
        </Button>
      </div>
      {treeContainer &&
        createPortal(
          <nav {...stylex.props(styles.tree)} aria-label="Changed files">
            {visible.map((entry) => (
              <div key={entry.file.path} {...stylex.props(styles.treeRow)}>
                <button
                  type="button"
                  {...stylex.props(styles.fileButton)}
                  aria-current={
                    entry.file.path === selectedPath ? "true" : undefined
                  }
                  onClick={() => navigate(entry.file.path)}
                  title={
                    entry.file.previousPath
                      ? `${entry.file.previousPath} → ${entry.file.path}`
                      : entry.file.path
                  }
                >
                  {entry.file.path}
                </button>
                <DiffCount
                  additions={entry.file.additions}
                  deletions={entry.file.deletions}
                />
                {viewed(entry.file.path)}
              </div>
            ))}
          </nav>,
          treeContainer,
        )}
      {comparison.error && (
        <p {...stylex.props(styles.notice)} role="alert">
          {comparison.error.message}
        </p>
      )}
      {visible.length === 0 && (
        <p {...stylex.props(styles.notice)} role="status">
          No changed files
        </p>
      )}
      {chosen && (!chosen.diff || chosen.error) && (
        <div
          {...stylex.props(styles.notice)}
          role={chosen.error ? "alert" : "status"}
        >
          <strong>{chosen.file.path}</strong>
          <p>{chosen.error ?? chosen.notice ?? "Loading diff…"}</p>
          {(chosen.error || chosen.notice) && (
            <div {...stylex.props(styles.noticeActions)}>
              {structural && chosen.error && (
                <Button onClick={() => setStructural(false)}>
                  Show text diff
                </Button>
              )}
              <Button onClick={() => void openSource(chosen.file)}>
                <ExternalLinkIcon aria-hidden="true" />
                Open source
              </Button>
            </div>
          )}
        </div>
      )}
      <CodeView
        ref={viewer}
        items={items}
        options={options}
        selectedLines={selection}
        style={{ flex: 1, minHeight: 0, width: "100%", overflowY: "auto" }}
        renderHeaderPrefix={(item) => (
          <IconButton
            aria-label={`${item.collapsed ? "Expand" : "Collapse"} ${item.id}`}
            aria-expanded={!item.collapsed}
            onClick={() => {
              const next = new Set(collapsed);
              if (next.has(item.id)) next.delete(item.id);
              else next.add(item.id);
              setCollapsed(next);
              saved.current.collapsed = [...next];
              save();
            }}
          >
            {item.collapsed ? (
              <ChevronRightIcon size={14} aria-hidden="true" />
            ) : (
              <ChevronDownIcon size={14} aria-hidden="true" />
            )}
          </IconButton>
        )}
        renderHeaderMetadata={(item) => (
          <div {...stylex.props(styles.headerActions)}>
            {viewed(item.id)}
            <Button
              variant="ghost"
              aria-label={`Open source: ${item.id}`}
              onClick={() => {
                const entry = entries.find(
                  (entry) => entry.file.path === item.id,
                )!;
                void openSource(entry.file);
              }}
            >
              <ExternalLinkIcon size={14} aria-hidden="true" />
              Open
            </Button>
          </div>
        )}
        onScroll={(scrollTop, instance) => {
          if (!restored.current || hidden) return;
          const current = instance
            .getRenderedItems()
            .find(
              (item) =>
                instance.getLocalTopForInstance(item.instance) +
                  item.instance.getVirtualizedHeight() >
                scrollTop + 48,
            );
          if (!current) return;
          const top = instance.getLocalTopForInstance(current.instance);
          const line = current.instance.getNumericScrollAnchor(
            scrollTop - top + 48,
          );
          saved.current.anchor = {
            id: current.id,
            line,
            offset: top + (line?.top ?? 0) - scrollTop,
          };
          setSelectedPath(current.id);
          save();
        }}
        onSelectedLinesChange={(value) => {
          setSelection(value);
          if (!value) {
            select(null);
            return;
          }
          const entry = entries.find((entry) => entry.file.path === value.id);
          if (!entry?.diff) return;
          setSelectedPath(entry.file.path);
          const side = value.range.side === "deletions" ? "base" : "head";
          if (value.range.endSide && value.range.endSide !== value.range.side) {
            select(null);
            return;
          }
          const from = Math.min(value.range.start, value.range.end);
          const to = Math.max(value.range.start, value.range.end);
          const source = new URL(url);
          const version = source.searchParams.get("version");
          select({
            title: `${entry.file.path}:${from}${to === from ? "" : `–${to}`}`,
            target: {
              kind: "code",
              path:
                side === "base"
                  ? (entry.file.previousPath ?? entry.file.path)
                  : entry.file.path,
              side,
              startLine: from,
              endLine: to,
            },
            apiSource: version
              ? {
                  reviewId: session.config.reviewId,
                  version: Number(version),
                  ...(scope ? { commit: scope.commit } : {}),
                }
              : undefined,
            selectedDiff: selectedPierreDiff(
              renderedDiffs.current.get(entry.diff)!,
              side,
              from,
              to,
              entry.file.status === "added"
                ? ""
                : (entry.file.previousPath ?? entry.file.path),
              entry.file.status === "deleted" ? "" : entry.file.path,
            ),
            anchorContainer:
              viewer.current?.getInstance()?.getContainerElement() ??
              container.current ??
              undefined,
          });
        }}
      />
    </div>
  );
}

function readSavedView(key: string): SavedView {
  const value = readReviewUiState<unknown>("session", key);
  if (!isJsonObject(value)) return { collapsed: [] };
  const collapsed = Array.isArray(value.collapsed)
    ? value.collapsed.filter((path): path is string => typeof path === "string")
    : [];
  const anchor = value.anchor;
  if (
    !isJsonObject(anchor) ||
    typeof anchor.id !== "string" ||
    typeof anchor.offset !== "number" ||
    !Number.isFinite(anchor.offset)
  )
    return { collapsed };
  const line = anchor.line;
  return {
    collapsed,
    anchor: {
      id: anchor.id,
      offset: anchor.offset,
      line:
        isJsonObject(line) &&
        typeof line.lineNumber === "number" &&
        line.lineNumber > 0 &&
        typeof line.top === "number" &&
        (line.side === undefined ||
          line.side === "additions" ||
          line.side === "deletions")
          ? { lineNumber: line.lineNumber, top: line.top, side: line.side }
          : undefined,
    },
  };
}

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 240,
    minWidth: 0,
    position: "relative",
  },
  workspace: { minHeight: 0, flex: 1 },
  notice: {
    padding: 16,
    color: tokens.inkMuted,
    fontFamily: tokens.fontMono,
    fontSize: fontSize.body,
  },
  noticeActions: { display: "flex", flexWrap: "wrap", gap: 8 },
  tree: { minWidth: 0, paddingBlock: 4 },
  treeRow: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    minHeight: 28,
    paddingInline: 8,
  },
  fileButton: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: tokens.ink,
    fontFamily: tokens.fontMono,
    fontSize: fontSize.body,
    textAlign: "left",
    cursor: "pointer",
    paddingBlock: 5,
  },
  wrapButton: { height: 32 },
  wrapActive: {
    backgroundColor: tokens.accentWash,
    borderColor: tokens.accentOutline,
    color: tokens.accent,
  },
  lensNotice: { marginInlineEnd: "auto" },
  functionPicker: { maxWidth: "min(256px, 100%)", minWidth: 0 },
  modePicker: { flexShrink: 0 },
  headerActions: { display: "flex", gap: 8, alignItems: "center" },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingInline: 8,
    paddingBlock: 8,
    fontFamily: tokens.fontMono,
    fontSize: fontSize.body,
    color: tokens.inkMuted,
  },
});
