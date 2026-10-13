import {
  type StructuralDiff,
  type StructuralRegion,
  decodeReviewStructuralDiffEvent,
  structuralRows,
} from "@blackboard/review-protocol";
import { type FileDiffMetadata, parsePatchFiles } from "@pierre/diffs";

import type { PierreComparisonEntry } from "./pierre-comparison";

/** Keep diffr's source alignment and semantic changes, rendered by Pierre. */
export function structuralMetadata(
  diff: Extract<StructuralDiff, { type: "text" }>,
  path: string,
  previousPath?: string,
): FileDiffMetadata | undefined {
  const lines = (text: string | undefined) =>
    text?.match(/[^\n]*\n|[^\n]+$/g) ?? [];

  const base = lines(diff.lhs?.text);
  const head = lines(diff.rhs?.text);

  const changed = (line: number | null, ranges: [number, number][]) =>
    line !== null && ranges.some(([from, to]) => line >= from && line < to);

  const rows = structuralRows(diff).flatMap(
    ([a, b]): [number | null, number | null][] => {
      const oldLine = a !== null && a < base.length ? a : null;
      const newLine = b !== null && b < head.length ? b : null;

      return oldLine !== null || newLine !== null ? [[oldLine, newLine]] : [];
    },
  );

  const isChanged = ([a, b]: (typeof rows)[number]) =>
    changed(a, diff.structural_changes.base) ||
    changed(b, diff.structural_changes.head);

  const scopes: Record<"base" | "head", StructuralRegion[]> = {
    base: [],
    head: [],
  };

  const walk = (region: StructuralRegion, into: StructuralRegion[]) => {
    if (region.kind === "fold") {
      if (region.tags?.includes("context:scope")) into.push(region);
      region.children.forEach((child) => walk(child, into));
    }
  };

  diff.lhs?.regions?.forEach((region) => walk(region, scopes.base));
  diff.rhs?.regions?.forEach((region) => walk(region, scopes.head));

  const scopeFor = (index: number) => {
    const [a, b] = rows[index]!;
    const line = b ?? a!;

    return (b !== null ? scopes.head : scopes.base)
      .filter(
        (region) =>
          region.start.line <= line &&
          (region.end.column === 0 ? region.end.line : region.end.line + 1) >
            line,
      )
      .sort(
        (x, y) => x.end.line - x.start.line - (y.end.line - y.start.line),
      )[0];
  };

  const blocks: string[] = [];
  let previousEnd = 0;

  for (let i = 0; i < rows.length; ) {
    if (!isChanged(rows[i]!)) {
      i++;
      continue;
    }

    let from = Math.max(previousEnd, i - 3);
    let to = Math.min(rows.length, i + 4);
    const scope = scopeFor(i);

    // Merge nearby edits, retaining three aligned context rows on either side.
    for (let j = i + 1; j < Math.min(rows.length, to + 3); j++) {
      if (isChanged(rows[j]!) && scopeFor(j) !== scope) {
        to = Math.min(to, j);
        break;
      }

      if (isChanged(rows[j]!)) to = Math.min(rows.length, j + 4);
    }

    // Formatting-only one-sided rows cannot be represented as patch context.
    // Stop at them rather than promote them to semantic changes.
    for (let j = from; j < i; j++)
      if (!isChanged(rows[j]!) && rows[j]!.includes(null)) from = j + 1;

    for (let j = i + 1; j < to; j++)
      if (!isChanged(rows[j]!) && rows[j]!.includes(null)) {
        to = j;
        break;
      }

    const segment = rows.slice(from, to);
    const a = segment.flatMap(([line]) => (line === null ? [] : [line]));
    const b = segment.flatMap(([, line]) => (line === null ? [] : [line]));

    const aStart = a.length
      ? a[0]! + 1
      : (rows
          .slice(0, from)
          .flatMap(([line]) => (line === null ? [] : [line]))
          .at(-1) ?? -1) + 1;

    const bStart = b.length
      ? b[0]! + 1
      : (rows
          .slice(0, from)
          .flatMap(([, line]) => (line === null ? [] : [line]))
          .at(-1) ?? -1) + 1;

    const label = scope
      ? (scope.visibility?.label ??
        (rows[i]![1] !== null ? head : base)[scope.start.line]?.trim())
      : undefined;

    blocks.push(
      `@@ -${aStart},${a.length} +${bStart},${b.length} @@${label ? ` ${label}` : ""}\n`,
    );

    const emit = (prefix: string, text: string) => {
      blocks.push(prefix + text.replace(/\n$/, "") + "\n");

      if (!text.endsWith("\n")) blocks.push("\\ No newline at end of file\n");
    };

    for (let j = 0; j < segment.length; ) {
      const row = segment[j]!;

      if (!isChanged(row)) {
        emit(" ", base[row[0]!]!);
        j++;
        continue;
      }

      let end = j + 1;

      while (end < segment.length && isChanged(segment[end]!)) end++;

      for (const [line] of segment.slice(j, end))
        if (line !== null) emit("-", base[line]!);

      for (const [, line] of segment.slice(j, end))
        if (line !== null) emit("+", head[line]!);
      j = end;
    }

    i = to;
    previousEnd = to;
  }

  if (!blocks.length) return undefined;

  // Names are assigned from the manifest after parsing, avoiding patch quoting ambiguity.
  const metadata = parsePatchFiles(
    `--- ${diff.lhs ? "a/source" : "/dev/null"}\n+++ ${diff.rhs ? "b/source" : "/dev/null"}\n${blocks.join("")}`,
    undefined,
    true,
  )[0]!.files[0]!;

  metadata.name = path;
  metadata.prevName = previousPath;
  metadata.type = !diff.lhs
    ? "new"
    : !diff.rhs
      ? "deleted"
      : previousPath
        ? "rename-changed"
        : "change";

  // Full original sources preserve each side's formatting and real source coordinates.
  for (const hunk of metadata.hunks) {
    hunk.noEOFCRDeletions =
      hunk.deletionCount > 0 &&
      hunk.deletionStart + hunk.deletionCount - 1 === base.length &&
      !diff.lhs!.text.endsWith("\n");
    hunk.noEOFCRAdditions =
      hunk.additionCount > 0 &&
      hunk.additionStart + hunk.additionCount - 1 === head.length &&
      !diff.rhs!.text.endsWith("\n");

    const aOffset =
      Math.max(0, hunk.deletionStart - 1) - hunk.deletionLineIndex;

    const bOffset =
      Math.max(0, hunk.additionStart - 1) - hunk.additionLineIndex;

    hunk.deletionLineIndex += aOffset;
    hunk.additionLineIndex += bOffset;

    for (const block of hunk.hunkContent) {
      block.deletionLineIndex += aOffset;
      block.additionLineIndex += bOffset;
    }
  }

  metadata.deletionLines = base;
  metadata.additionLines = head;
  metadata.isPartial = false;

  return metadata;
}

export async function loadStructuralFile(
  entry: PierreComparisonEntry,
  url: URL,
  request: (url: string | URL, init?: RequestInit) => Promise<Response>,
  signal: AbortSignal,
): Promise<void> {
  url.pathname = url.pathname.replace(/\/diff$/, "/structural-diff");
  url.searchParams.set("file", entry.file.path);
  url.searchParams.delete("format");
  url.searchParams.delete("maxBytes");
  const response = await request(url, { signal });

  if (!response.ok)
    throw new Error(`Cannot load structural diff (${response.status})`);

  if (!response.body) throw new Error("Missing structural diff stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let found = false;
  let complete = false;
  entry.bytes = 0;

  const cancel = () => {
    void reader.cancel().catch(() => {});
  };

  signal.addEventListener("abort", cancel, { once: true });

  const record = (line: string) => {
    if (!line.trim()) return;
    const event = decodeReviewStructuralDiffEvent(line);

    if (event.type === "error") throw new Error(event.message);

    if (event.type === "complete") {
      if (event.aborted) throw new Error(event.aborted.message);
      complete = true;
    }

    if (event.type !== "file") return;
    const path = event.file.rhs?.path ?? event.file.lhs?.path;

    if (path !== entry.file.path && path !== entry.file.previousPath) return;
    found = true;

    if (event.error) throw new Error(event.error.message);

    if (event.diff.type === "binary") {
      entry.notice = "Binary file";

      return;
    }

    if (event.diff.stats.fallback)
      throw new Error(event.diff.stats.fallback.message);
    entry.diff = structuralMetadata(
      event.diff,
      entry.file.path,
      entry.file.previousPath,
    );

    if (!entry.diff) entry.notice = "No structural code changes";
  };

  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();

      if (done) {
        pending += decoder.decode();
        break;
      }

      entry.bytes += value.byteLength;

      // ponytail: bound full-source records; larger files remain available in Text mode.
      if (entry.bytes > 5_000_000)
        throw new Error(
          "Structural diff exceeds 5 MB; use Text mode for this file",
        );
      pending += decoder.decode(value, { stream: true });
      let end: number;

      while ((end = pending.indexOf("\n")) !== -1) {
        record(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
    }

    record(pending);

    if (!found || !complete)
      throw new Error("Incomplete structural diff stream");
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
