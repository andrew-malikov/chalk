import {
  compileReviewFindQuery,
  regularExpressionMatches,
} from "@canvas/review-find-query";
import type {
  ReviewDiffSide,
  ReviewFindQuery,
  ReviewInlineEditorRange,
} from "@dev.fast/review-protocol";
import {
  type FileDiffMetadata,
  parseDiffFromFile,
  parsePatchFiles,
} from "@pierre/diffs";

/** A partial diff containing only the authored ranges and their aligned context. */
export function createPierreSnippet(
  path: string,
  before: string,
  after: string,
  ranges: readonly ReviewInlineEditorRange[],
  side: ReviewDiffSide,
): FileDiffMetadata {
  const full = parseDiffFromFile(
    { name: path, contents: before },
    { name: path, contents: after },
  );

  const groups: Array<{
    oldStart: number;
    newStart: number;
    oldCount: number;
    newCount: number;
    lines: string[];
  }> = [];

  let current: (typeof groups)[number] | undefined;
  let oldCursor = 1;
  let newCursor = 1;

  for (const { deletionLine, additionLine, type } of pierreSnippetRows(full)) {
    const included = ranges.some((range) => {
      const line =
        (range.side ?? side) === "base"
          ? (deletionLine?.lineNumber ?? oldCursor)
          : (additionLine?.lineNumber ?? newCursor);

      return (
        line >= Math.min(range.startLine, range.endLine) - 3 &&
        line <= Math.max(range.startLine, range.endLine) + 3
      );
    });

    if (included) {
      if (!current) {
        current = {
          oldStart: oldCursor,
          newStart: newCursor,
          oldCount: 0,
          newCount: 0,
          lines: [],
        };
        groups.push(current);
      }

      const append = (marker: string, text: string) => {
        current!.lines.push(`${marker}${text.replace(/\r?\n$/, "")}\n`);

        if (!text.endsWith("\n"))
          current!.lines.push("\\ No newline at end of file\n");
      };

      if (type !== "change") {
        append(" ", full.additionLines[additionLine!.lineIndex]!);
      } else {
        if (deletionLine)
          append("-", full.deletionLines[deletionLine.lineIndex]!);

        if (additionLine)
          append("+", full.additionLines[additionLine.lineIndex]!);
      }

      if (deletionLine) current.oldCount++;

      if (additionLine) current.newCount++;
    } else current = undefined;

    if (deletionLine) oldCursor = deletionLine.lineNumber + 1;

    if (additionLine) newCursor = additionLine.lineNumber + 1;
  }

  if (!groups.length)
    return {
      ...full,
      hunks: [],
      isPartial: true,
      deletionLines: [],
      additionLines: [],
      splitLineCount: 0,
      unifiedLineCount: 0,
    };

  // Fixed header names avoid interpreting unusual repository paths as patch syntax.
  const patch =
    "--- a/snippet\n+++ b/snippet\n" +
    groups
      .map(
        (group) =>
          `@@ -${group.oldStart - Number(group.oldCount === 0)},${group.oldCount} +${group.newStart - Number(group.newCount === 0)},${group.newCount} @@\n${group.lines.join("")}`,
      )
      .join("");

  const diff = parsePatchFiles(patch, undefined, true)[0]!.files[0]!;
  diff.name = path;
  diff.prevName = full.prevName;

  return diff;
}

export interface PierreSnippetMatch {
  side: ReviewDiffSide;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

/** Search rendered source, counting shared context once and never bridging gaps. */
export function findPierreSnippet(
  diff: FileDiffMetadata,
  query: ReviewFindQuery,
): PierreSnippetMatch[] {
  if (!query.text) return [];
  const compiled = compileReviewFindQuery(query);

  if ("error" in compiled) return [];

  const chunks: Array<{
    side: ReviewDiffSide;
    lines: Array<{ number: number; text: string }>;
  }> = [];

  const rows = [...pierreSnippetRows(diff)];
  const context = new Map<number, number>();

  const order = {
    base: new Map<number, number>(),
    head: new Map<number, number>(),
  };

  for (const [index, row] of rows.entries()) {
    if (row.type === "context")
      context.set(row.deletionLine!.lineNumber, row.additionLine!.lineNumber);

    if (row.deletionLine) order.base.set(row.deletionLine.lineNumber, index);

    if (row.additionLine) order.head.set(row.additionLine.lineNumber, index);
  }

  for (const side of ["base", "head"] as const) {
    for (const row of rows) {
      const line = side === "base" ? row.deletionLine : row.additionLine;

      if (!line) continue;
      const previous = chunks.at(-1);

      const text = (side === "head" ? diff.additionLines : diff.deletionLines)[
        line.lineIndex
      ]!;

      if (
        previous?.side === side &&
        previous.lines.at(-1)!.number + 1 === line.lineNumber
      )
        previous.lines.push({ number: line.lineNumber, text });
      else chunks.push({ side, lines: [{ number: line.lineNumber, text }] });
    }
  }

  const matches = chunks.flatMap((chunk) => {
    const starts: number[] = [];
    let offset = 0;

    for (const line of chunk.lines) {
      starts.push(offset);
      offset += line.text.length;
    }

    return regularExpressionMatches(
      chunk.lines.map((line) => line.text).join(""),
      compiled.expression,
    ).map(({ start, end }) => {
      const first = starts.findLastIndex((offset) => offset <= start);
      const last = starts.findLastIndex((offset) => offset < end);

      return {
        side: chunk.side,
        startLine: chunk.lines[first]!.number,
        endLine: chunk.lines[last]!.number,
        startColumn: start - starts[first]!,
        endColumn: end - starts[last]!,
      };
    });
  });

  return matches
    .filter((match) => {
      if (match.side === "head") return true;
      const start = context.get(match.startLine);

      if (start === undefined) return true;

      for (let line = match.startLine; line <= match.endLine; line++) {
        if (context.get(line) !== start + line - match.startLine) return true;
      }

      return false;
    })
    .sort(
      (a, b) =>
        order[a.side].get(a.startLine)! - order[b.side].get(b.startLine)! ||
        a.startColumn - b.startColumn ||
        (a.side === b.side ? 0 : a.side === "base" ? -1 : 1),
    );
}

interface SnippetLine {
  lineNumber: number;
  lineIndex: number;
}

interface SnippetRow {
  type: "context" | "change";
  deletionLine?: SnippetLine;
  additionLine?: SnippetLine;
}

/** Traverse Pierre's public hunk metadata with split-row correspondence. */
export function* pierreSnippetRows(
  diff: FileDiffMetadata,
): Generator<SnippetRow> {
  let oldIndex = 0;
  let newIndex = 0;

  for (const hunk of diff.hunks) {
    if (!diff.isPartial) {
      while (
        oldIndex < hunk.deletionLineIndex &&
        newIndex < hunk.additionLineIndex
      ) {
        yield {
          type: "context",
          deletionLine: { lineNumber: oldIndex + 1, lineIndex: oldIndex++ },
          additionLine: { lineNumber: newIndex + 1, lineIndex: newIndex++ },
        };
      }
    }

    let oldLine = hunk.deletionStart;
    let newLine = hunk.additionStart;

    for (const content of hunk.hunkContent) {
      const oldCount =
        content.type === "context" ? content.lines : content.deletions;

      const newCount =
        content.type === "context" ? content.lines : content.additions;

      for (let offset = 0; offset < Math.max(oldCount, newCount); offset++) {
        yield {
          type: content.type,
          deletionLine:
            offset < oldCount
              ? {
                  lineNumber: oldLine + offset,
                  lineIndex: content.deletionLineIndex + offset,
                }
              : undefined,
          additionLine:
            offset < newCount
              ? {
                  lineNumber: newLine + offset,
                  lineIndex: content.additionLineIndex + offset,
                }
              : undefined,
        };
      }

      oldLine += oldCount;
      newLine += newCount;
    }

    oldIndex = hunk.deletionLineIndex + hunk.deletionCount;
    newIndex = hunk.additionLineIndex + hunk.additionCount;
  }

  if (!diff.isPartial) {
    while (
      oldIndex < diff.deletionLines.length &&
      newIndex < diff.additionLines.length
    ) {
      yield {
        type: "context",
        deletionLine: { lineNumber: oldIndex + 1, lineIndex: oldIndex++ },
        additionLine: { lineNumber: newIndex + 1, lineIndex: newIndex++ },
      };
    }
  }
}
