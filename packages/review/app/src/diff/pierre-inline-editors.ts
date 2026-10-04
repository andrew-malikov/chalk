import type { ReviewSession } from "@canvas/host/review-session";
import type {
  ReviewDiffFileWire,
  ReviewDiffProgress,
  ReviewFindQuery,
  ReviewInlineEditorFactory,
  ReviewInlineEditorSpec,
  ReviewInlineFindSpec,
} from "@dev.fast/review-protocol";
import { FileDiff, type FileDiffMetadata } from "@pierre/diffs";

import {
  type PierreSnippetMatch,
  createPierreSnippet,
  findPierreSnippet,
  pierreSnippetRows,
} from "./pierre-snippet";

let nextHighlightId = 0;

/** Pierre implementation of the document's existing lazy-preview/find contract. */
export function createPierreInlineEditors(
  session: ReviewSession,
): ReviewInlineEditorFactory {
  const snippets = new Map<string, Promise<FileDiffMetadata>>();

  function load(spec: ReviewInlineFindSpec): Promise<FileDiffMetadata> {
    const key = JSON.stringify(spec);
    const previous = snippets.get(key);

    if (previous) return previous;

    const loading = (async () => {
      const url = new URL(session.apiUrl("/diff"));

      for (const [name, value] of Object.entries(spec.pins ?? {}))
        url.searchParams.set(name, value);
      const response = await session.fetchUrl(url);
      await assertResponse(response);

      const files: ReviewDiffFileWire[] = await response.json();

      const file = files.find(
        (file) => file.path === spec.path || file.previousPath === spec.path,
      );

      if (file?.binary) throw new Error("Binary file");

      async function read(side: "base" | "head") {
        if (
          (side === "base" && file?.status === "added") ||
          (side === "head" && file?.status === "deleted")
        )
          return "";
        const source = new URL(url);
        source.pathname = source.pathname.replace(/\/diff$/, "/file");
        source.searchParams.set(
          "file",
          side === "base"
            ? (file?.previousPath ?? file?.path ?? spec.path)
            : (file?.path ?? spec.path),
        );
        source.searchParams.set("side", side);
        source.searchParams.set("binary", "describe");
        const response = await session.fetchUrl(source);
        await assertResponse(response);

        const contents: { text?: string; binary?: boolean } =
          await response.json();

        if (contents.binary) throw new Error("Binary file");

        if (contents.text === undefined)
          throw new Error("Source text unavailable");

        return contents.text;
      }

      const [before, after] = await Promise.all([read("base"), read("head")]);

      return createPierreSnippet(
        file?.path ?? spec.path,
        before,
        after,
        spec.ranges,
        spec.side,
      );
    })();

    snippets.set(key, loading);
    void loading.catch(() => {
      if (snippets.get(key) === loading) snippets.delete(key);
    });

    return loading;
  }

  return {
    async find(spec, query) {
      return { matchCount: findPierreSnippet(await load(spec), query).length };
    },
    create(spec) {
      return mount(
        spec,
        load({
          path: spec.path,
          side: spec.side,
          pins: spec.pins,
          ranges: spec.ranges,
        }),
        session,
      );
    },
  };
}

function mount(
  spec: ReviewInlineEditorSpec,
  loading: Promise<FileDiffMetadata>,
  session: ReviewSession,
) {
  const document = spec.container.ownerDocument;
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:10px;height:40px;padding:0 10px;font:12px var(--font-mono,monospace);color:var(--ink);background:var(--surface);";
  const open = document.createElement("button");
  open.type = "button";
  open.textContent = spec.title;
  open.title = spec.description ?? spec.path;
  open.style.cssText =
    "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;text-align:left;white-space:nowrap;background:none;border:0;color:inherit;cursor:pointer;font:inherit;";
  open.addEventListener("click", () => {
    spec.onDidNavigate?.();
    spec.onDidOpen?.();
  });
  const counts = document.createElement("span");
  const progressLabel = document.createElement("span");
  header.append(open, counts, progressLabel);
  const body = document.createElement("div");
  body.style.cssText = `overflow:auto;${spec.heightMode === "capped" ? "max-height:360px;" : ""}`;
  body.tabIndex = 0;
  body.setAttribute("aria-label", `${spec.title} code preview`);
  body.textContent = "Loading preview…";
  spec.container.replaceChildren(header, body);
  spec.container.dataset.pierreInlineDiff = "true";
  const heightListeners = new Set<(height: number) => void>();
  const errorListeners = new Set<(message: string) => void>();
  let height = 60;
  let disposed = false;
  let collapsed = false;
  let diff: FileDiffMetadata | undefined;
  let query: ReviewFindQuery | undefined;
  let matches: PierreSnippetMatch[] = [];
  let activeMatch: number | undefined;
  const highlightName = `pierre-find-${++nextHighlightId}`;
  const activeHighlightName = `${highlightName}-active`;
  const highlights = document.defaultView?.CSS.highlights;

  function updateHeight() {
    if (disposed) return;
    const next = 40 + (collapsed ? 0 : body.getBoundingClientRect().height);

    if (height === next) return;
    height = next;

    for (const listener of heightListeners) listener(height);
  }

  const resize = new ResizeObserver(() => requestAnimationFrame(updateHeight));
  resize.observe(body);

  function nodesFor(match: PierreSnippetMatch) {
    const root = body.querySelector("diffs-container")?.shadowRoot;

    const nodes = [
      ...(root?.querySelectorAll<HTMLElement>("[data-code] [data-line]") ?? []),
    ];

    return nodes.filter((node) => {
      const line = sourceLine(node, match);

      if (line < match.startLine || line > match.endLine) return false;

      const deletions =
        node.closest("[data-deletions]") ||
        node.dataset.lineType === "change-deletion";

      return match.side === "base"
        ? !!deletions ||
            (!node.closest("[data-additions]") &&
              node.dataset.altLine !== undefined)
        : !deletions;
    });
  }

  function sourceLine(node: HTMLElement, match: PierreSnippetMatch) {
    return Number(
      match.side === "base" && !node.closest("[data-deletions]")
        ? (node.dataset.altLine ?? node.dataset.line)
        : node.dataset.line,
    );
  }

  function highlightRanges(match: PierreSnippetMatch) {
    return nodesFor(match).flatMap((node) => {
      const line = sourceLine(node, match);
      const start = line === match.startLine ? match.startColumn : 0;

      const end =
        line === match.endLine
          ? match.endColumn
          : (node.textContent?.length ?? 0);

      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let offset = 0;
      const ranges: Range[] = [];

      while (walker.nextNode()) {
        const text = walker.currentNode;
        const length = text.textContent?.length ?? 0;

        if (offset < end && offset + length > start) {
          const range = document.createRange();
          range.setStart(text, Math.max(0, start - offset));
          range.setEnd(text, Math.min(length, end - offset));
          ranges.push(range);
        }

        offset += length;
      }

      return ranges;
    });
  }

  function decorate() {
    if (disposed || !highlights) return;
    highlights.set(
      highlightName,
      new Highlight(...matches.flatMap(highlightRanges)),
    );
    const active = activeMatch === undefined ? undefined : matches[activeMatch];
    const highlight = new Highlight(...(active ? highlightRanges(active) : []));
    highlight.priority = 1;
    highlights.set(activeHighlightName, highlight);
  }

  const instance = new FileDiff({
    disableFileHeader: true,
    hunkSeparators: "line-info",
    enableLineSelection: true,
    preferredHighlighter: "shiki-js",
    overflow: "scroll",
    onLineEnter: () => spec.onDidShowHover?.(),
    onLineSelected: () => spec.onDidNavigate?.(),
    onPostRender: () => {
      requestAnimationFrame(updateHeight);
      decorate();
    },
    unsafeCSS: `:host{--diffs-font-family:var(--font-mono,monospace);--diffs-font-size:12px;--diffs-line-height:20px;--diffs-bg:var(--surface);--diffs-fg:var(--ink)}::highlight(${highlightName}){background:var(--review-find-match-background)}::highlight(${activeHighlightName}){background:var(--review-find-match-active-background)}`,
  });

  function refreshOptions() {
    const theme = session.bridge.currentTheme();
    instance.setOptions({
      ...instance.options,
      diffStyle: session.bridge.currentDiffLayout(),
      theme: theme === "light" ? "pierre-light" : "pierre-dark",
      themeType: theme,
    });

    if (diff) instance.render({ fileDiff: diff, containerWrapper: body });
  }

  const themeSubscription = session.bridge.onDidChangeTheme(refreshOptions);

  const layoutSubscription =
    session.bridge.onDidChangeDiffLayout(refreshOptions);

  function focus() {
    spec.onDidFocus?.();
  }

  spec.container.addEventListener("focusin", focus);

  function setProgress(progress?: ReviewDiffProgress) {
    const file = progress?.files.find(
      (file) => file.path === diff?.name || file.path === spec.path,
    );

    if (!file) {
      progressLabel.textContent = "";

      return;
    }

    const total = file.total.additions + file.total.deletions;
    const remaining = file.remaining.additions + file.remaining.deletions;
    progressLabel.textContent = `${total - remaining}/${total} viewed`;
  }

  const ready = loading
    .then((loaded) => {
      if (disposed) return;
      diff = structuredClone(loaded);
      body.replaceChildren();

      if (!diff.hunks.length)
        body.textContent = "No source lines in this range";
      else refreshOptions();
      let additions = 0;
      let deletions = 0;

      for (const hunk of diff.hunks) {
        let oldCursor = hunk.deletionStart + Number(hunk.deletionCount === 0);
        let newCursor = hunk.additionStart + Number(hunk.additionCount === 0);

        for (const row of pierreSnippetRows({ ...diff, hunks: [hunk] })) {
          const oldLine = row.deletionLine?.lineNumber ?? oldCursor;
          const newLine = row.additionLine?.lineNumber ?? newCursor;

          if (row.deletionLine) oldCursor = oldLine + 1;

          if (row.additionLine) newCursor = newLine + 1;

          if (row.type !== "change") continue;

          for (const range of spec.countRanges ?? spec.ranges) {
            const anchor =
              (range.side ?? spec.side) === "base" ? oldLine : newLine;

            if (
              anchor < Math.min(range.startLine, range.endLine) ||
              anchor > Math.max(range.startLine, range.endLine)
            )
              continue;

            if (row.additionLine) additions++;

            if (row.deletionLine) deletions++;
          }
        }
      }

      counts.textContent =
        additions || deletions ? `+${additions} −${deletions}` : "";
      setProgress(spec.progress);

      if (query) matches = findPierreSnippet(diff, query);
      decorate();
      updateHeight();
    })
    .catch((error) => {
      if (disposed) return;
      body.textContent = "";

      for (const listener of errorListeners)
        listener(error instanceof Error ? error.message : String(error));
      updateHeight();
    });

  refreshOptions();
  setProgress(spec.progress);

  return {
    get height() {
      return height;
    },
    setActive(active: boolean) {
      spec.container.dataset.reviewInlineEditorActive = String(active);
    },
    setCollapsed(value: boolean) {
      collapsed = value;
      body.hidden = value;
      updateHeight();
    },
    setProgress,
    onDidChangeHeight(listener: (height: number) => void) {
      heightListeners.add(listener);

      return {
        dispose() {
          heightListeners.delete(listener);
        },
      };
    },
    onDidError(listener: (message: string) => void) {
      errorListeners.add(listener);

      return {
        dispose() {
          errorListeners.delete(listener);
        },
      };
    },
    async setFindQuery(value: ReviewFindQuery) {
      query = value;
      await ready;

      if (disposed || query !== value) return { matchCount: 0 };
      matches = diff ? findPierreSnippet(diff, value) : [];
      decorate();

      return { matchCount: matches.length };
    },
    revealFindMatch(index: number) {
      activeMatch = index;
      const match = matches[index];

      if (match)
        nodesFor(match)[0]?.scrollIntoView({
          block: "center",
          inline: "nearest",
        });
      decorate();
    },
    clearActiveFindMatch() {
      activeMatch = undefined;
      decorate();
    },
    clearFind() {
      query = undefined;
      matches = [];
      activeMatch = undefined;
      highlights?.delete(highlightName);
      highlights?.delete(activeHighlightName);
    },
    dispose() {
      disposed = true;
      themeSubscription.dispose();
      layoutSubscription.dispose();
      resize.disconnect();
      spec.container.removeEventListener("focusin", focus);
      highlights?.delete(highlightName);
      highlights?.delete(activeHighlightName);
      instance.cleanUp();
      spec.container.replaceChildren();
      heightListeners.clear();
      errorListeners.clear();
    },
  };
}

async function assertResponse(response: Response) {
  if (response.ok) return;

  const body: { error?: string } | null = await response
    .json()
    .catch(() => null);

  throw new Error(body?.error ?? `Source unavailable (${response.status})`);
}
