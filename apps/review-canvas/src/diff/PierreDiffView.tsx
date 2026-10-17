import { useAgentSelection } from "@canvas/agent-context/agent-selection";
import { useGitLab } from "@canvas/gitlab/gitlab-context";
import {
  type GitLabInlineAnnotation,
  GitLabInlineContent,
  discussionCollapsed,
  useGitLabDrafts,
} from "@canvas/gitlab/gitlab-discussions";
import { useReviewSession } from "@canvas/host/review-session";
import { cn } from "@canvas/lib/utils";
import { useReviewDiffFiles } from "@canvas/review/review-diff-files-context";
import {
  readReviewUiState,
  writeReviewUiState,
} from "@canvas/review/review-ui-state";
import { loadingStyles } from "@canvas/styles/loading";
import { Button, IconButton } from "@canvas/ui/button";
import type {
  ReviewCommitScope,
  ReviewDiffFileWire,
  ReviewDiffLens,
  ReviewDiffProgress,
} from "@chalk/review-contracts";
import type {
  CodeViewItem,
  CodeViewLineSelection,
  DiffLineAnnotation,
  FileDiffMetadata,
  NumericScrollLineAnchor,
} from "@pierre/diffs";
import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
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
import { z } from "zod";

import { ChangedFilesTree } from "./changed-files-tree";
import { useDiffPreference } from "./diff-settings";
import {
  type PierreComparisonEntry,
  loadPierreComparison,
  loadPierreFile,
} from "./pierre-comparison";
import { selectedPierreDiff } from "./pierre-selection";
import { selectedPierreText } from "./pierre-text-selection";
import { ViewedButton } from "./viewed-button";

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
  const session = useReviewSession();

  const [mode, setMode] = useDiffPreference("mode");
  const structural = mode === "structural";

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
      <p className={styles.notice} role="alert">
        {error}
      </p>
    );

  if (!files)
    return (
      <p className={cn(styles.notice, loadingStyles.text)} role="status">
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
      setStructural={(value) => setMode(value ? "structural" : "text")}
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
  const gitlab = useGitLab();
  const drafts = useGitLabDrafts();
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

  const textSelection = useRef<CodeViewLineSelection | null>(null);

  const [wrap] = useDiffPreference("wrap");

  // Pierre hydrates metadata in place; each mounted viewer owns its copy.
  const renderedDiffs = useRef(
    new WeakMap<FileDiffMetadata, FileDiffMetadata>(),
  );

  const viewer =
    useRef<CodeViewHandle<GitLabInlineAnnotation, undefined>>(null);

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

  const [layout] = useDiffPreference("layout");

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

  const annotations: (DiffLineAnnotation<GitLabInlineAnnotation> & {
    file: string;
  })[] = [];

  if (
    !scope &&
    session.review?.historicalRevision === null &&
    session.review?.pins?.base === gitlab?.state?.refs.baseSha &&
    session.review?.pins?.head === gitlab?.state?.refs.headSha
  ) {
    const chips = new Map<
      string,
      { annotation: (typeof annotations)[number]; ids: string[] }
    >();

    for (const discussion of gitlab?.state?.discussions ?? []) {
      if (!discussion.location) continue;

      const annotation = {
        file: discussion.location.file,
        lineNumber: discussion.location.to,
        side: discussion.location.side === "head" ? "additions" : "deletions",
        metadata: { kind: "discussion", id: discussion.id },
      } as const;

      if (!discussionCollapsed(discussion, gitlab!.collapsed, drafts)) {
        annotations.push(annotation);
        continue;
      }

      const key = `${annotation.file}:${annotation.side}:${annotation.lineNumber}`;
      const chip = chips.get(key);

      if (chip) chip.ids.push(discussion.id);
      else chips.set(key, { annotation, ids: [discussion.id] });
    }

    // Pierre stacks a line's annotations in array order; chips go first so they sit on the line itself.
    annotations.unshift(
      ...[...chips.values()].map(({ annotation, ids }) => ({
        ...annotation,
        metadata: { kind: "collapsed" as const, ids },
      })),
    );

    for (const draft of drafts) {
      const target = draft.target;

      if (
        draft.status === "sent" ||
        target.kind !== "inline" ||
        target.unmapped ||
        target.position.baseSha !== gitlab?.state?.refs.baseSha ||
        target.position.headSha !== gitlab?.state?.refs.headSha
      )
        continue;
      const p = target.position;
      annotations.push({
        file: p.side === "head" ? p.newPath : p.oldPath,
        lineNumber: p.to,
        side: p.side === "head" ? "additions" : "deletions",
        metadata: { kind: "draft", id: draft.id },
      });
    }
  }

  const annotationRevision = useRef({ key: "", version: 0 });
  // Editor text lives in GitLab context; typing must not recreate Pierre's slots.
  const annotationKey = JSON.stringify(annotations);

  if (annotationRevision.current.key !== annotationKey)
    annotationRevision.current = {
      key: annotationKey,
      version: annotationRevision.current.version + 2,
    };
  const annotationVersion = annotationRevision.current.version;

  const items = useMemo<CodeViewItem<GitLabInlineAnnotation>[]>(
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
            annotations: annotations.filter(
              (a) =>
                a.file === entry.file.path ||
                a.file === entry.file.previousPath,
            ),
            version: Number(collapsed.has(entry.file.path)) + annotationVersion,
            collapsed: collapsed.has(entry.file.path),
          },
        ];
      }),
    [visible, collapsed, annotationKey, annotationVersion],
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

  const lastGitLabReveal = useRef<number | undefined>(undefined);
  useEffect(() => {
    const reveal = gitlab?.reveal;

    if (
      !reveal ||
      lastGitLabReveal.current === reveal.nonce ||
      hidden ||
      scope ||
      lens
    )
      return;

    const entry = files.find(
      (file) => file.path === reveal.file || file.previousPath === reveal.file,
    );

    if (!entry) {
      session.surface.revealAnchor(
        reveal.file,
        { fromLine: reveal.from, toLine: reveal.to },
        reveal.side,
      );
      lastGitLabReveal.current = reveal.nonce;

      return;
    }

    lastGitLabReveal.current = reveal.nonce;
    navigate(entry.path);
    pendingReveal.current = undefined;
    pendingRange.current = {
      file: reveal.file,
      side: reveal.side,
      fromLine: reveal.from,
      toLine: reveal.to,
    };
    viewer.current?.scrollTo({
      type: "line",
      id: entry.path,
      lineNumber: reveal.from,
      side: reveal.side === "head" ? "additions" : "deletions",
      align: "start",
    });
    setSelection({
      id: entry.path,
      range: {
        start: reveal.from,
        end: reveal.to,
        side: reveal.side === "head" ? "additions" : "deletions",
      },
    });
  }, [gitlab?.reveal, hidden, scope, lens, files, navigate, session.surface]);
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

  const publishSelection = useCallback(
    (
      value:
        | (CodeViewLineSelection & {
            anchor?: { x: number; y: number };
            textRange?: Range;
          })
        | null,
    ) => {
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
              ...(scope && { commit: scope.commit }),
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
        anchor: value.anchor,
        range: value.textRange,
        anchorContainer:
          viewer.current?.getInstance()?.getContainerElement() ??
          container.current ??
          undefined,
      });
    },
    [entries, url, session.config.reviewId, scope, select],
  );

  useEffect(() => {
    if (hidden) return;
    const document = container.current!.ownerDocument;
    // The actions appear once a mouse drag ends, not while it is still extending.
    let dragging = false;
    let extended = false;

    const update = () => {
      extended = dragging;

      const value = dragging
        ? null
        : selectedPierreText(
            viewer.current?.getInstance()?.getRenderedItems() ?? [],
          );

      if (value) {
        textSelection.current = value;
        publishSelection(value);
      } else if (textSelection.current) {
        textSelection.current = null;
        select(null);
      }
    };

    const down = (event: PointerEvent) => {
      dragging = event.button === 0;
      extended = false;
    };

    const up = () => {
      if (!dragging) return;
      dragging = false;

      // Pressing the selection's own actions leaves it intact; republishing would swallow the click.
      if (extended) update();
    };

    document.addEventListener("selectionchange", update);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);

    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
    };
  }, [hidden, publishSelection, select]);

  const options = useMemo(
    () => ({
      diffStyle: layout,
      hunkSeparators:
        committed || structural ? ("line-info" as const) : ("simple" as const),
      theme: theme === "light" ? "pierre-light" : "pierre-dark",
      themeType: theme === "light" ? ("light" as const) : ("dark" as const),
      preferredHighlighter: "shiki-js" as const,
      overflow: wrap ? ("wrap" as const) : ("scroll" as const),
      stickyHeaders: true,
      unsafeCSS:
        ":host{--diffs-font-family:var(--font-mono,monospace);--diffs-font-size:12px;--diffs-line-height:20px;--diffs-bg:var(--surface);--diffs-fg:var(--ink)}[data-diffs-header]{box-shadow:inset 0 1px var(--rule)}:host(:first-child) [data-diffs-header]{box-shadow:none}:is([data-line-annotation],[data-gutter-buffer=annotation]){--diffs-annotation-bg:var(--diffs-bg)}",
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
        onClick={() => {
          if (file.state !== "viewed") setFileCollapsed(path, true);
          onToggleViewed(path);
        }}
      />
    );
  }

  function setFileCollapsed(path: string, value: boolean) {
    const next = new Set(collapsed);

    if (value) next.add(path);
    else next.delete(path);
    setCollapsed(next);
    saved.current.collapsed = [...next];
    save();
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
      className={cn(styles.root, inWorkspace && styles.workspace)}
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
      {treeContainer &&
        createPortal(
          <ChangedFilesTree
            files={visible.map((entry) => entry.file)}
            selectedPath={selectedPath}
            theme={theme === "light" ? "light" : "dark"}
            onSelect={navigate}
          />,
          treeContainer,
        )}
      {comparison.error && (
        <p className={styles.notice} role="alert">
          {comparison.error.message}
        </p>
      )}
      {visible.length === 0 && (
        <p className={styles.notice} role="status">
          No changed files
        </p>
      )}
      {chosen && (!chosen.diff || chosen.error) && (
        <div className={styles.notice} role={chosen.error ? "alert" : "status"}>
          <strong>{chosen.file.path}</strong>
          <p
            className={cn(
              !chosen.error && !chosen.notice && loadingStyles.text,
            )}
          >
            {chosen.error ?? chosen.notice ?? "Loading diff…"}
          </p>
          {(chosen.error || chosen.notice) && (
            <div className={styles.noticeActions}>
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
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          overflowY: "auto",
          position: "relative",
        }}
        renderAnnotation={(annotation) => (
          <GitLabInlineContent annotation={annotation.metadata} />
        )}
        renderHeaderPrefix={(item) => (
          <IconButton
            aria-label={`${item.collapsed ? "Expand" : "Collapse"} ${item.id}`}
            aria-expanded={!item.collapsed}
            onClick={() => setFileCollapsed(item.id, !item.collapsed)}
          >
            {item.collapsed ? (
              <ChevronRightIcon size={14} aria-hidden="true" />
            ) : (
              <ChevronDownIcon size={14} aria-hidden="true" />
            )}
          </IconButton>
        )}
        renderHeaderMetadata={(item) => (
          <div className={styles.headerActions}>
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
          textSelection.current = null;
          setSelection(value);
          publishSelection(value);
        }}
      />
    </div>
  );
}

const savedViewSchema = z.object({
  collapsed: z
    .array(z.json())
    .transform((values) =>
      values.flatMap((value) => {
        const parsed = z.string().safeParse(value);

        return parsed.success ? [parsed.data] : [];
      }),
    )
    .catch([]),
  anchor: z
    .object({
      id: z.string(),
      offset: z.number(),
      line: z
        .object({
          lineNumber: z.number().positive(),
          top: z.number(),
          side: z.enum(["additions", "deletions"]).optional(),
        })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
});

function readSavedView(key: string): SavedView {
  return (
    savedViewSchema.safeParse(readReviewUiState("session", key)).data ?? {
      collapsed: [],
    }
  );
}

const styles = {
  root: "tw:flex tw:flex-col tw:h-full tw:min-h-[240px] tw:min-w-0 tw:relative",
  workspace: "tw:min-h-0 tw:flex-[1]",
  notice:
    "tw:p-[16px] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:text-[length:12px]",
  noticeActions: "tw:flex tw:flex-wrap tw:gap-[8px]",
  headerActions: "tw:flex tw:gap-[8px] tw:items-center",
};
