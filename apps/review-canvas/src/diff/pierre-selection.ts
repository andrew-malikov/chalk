import type { ReviewSurfaceEvent } from "@chalk/review-contracts";
import type { FileDiffMetadata } from "@pierre/diffs";

type SelectedDiff = NonNullable<
  Extract<
    ReviewSurfaceEvent,
    { event: "editorSelectionChanged" }
  >["selectedDiff"]
>;

/** Retain complete replacements, but never pretend unloaded context is present. */
export function selectedPierreDiff(
  diff: FileDiffMetadata,
  side: "base" | "head",
  from: number,
  to: number,
  oldPath: string,
  newPath: string,
): SelectedDiff | undefined {
  const rows: SelectedDiff["rows"] = [];
  let oldStart = 0;
  let newStart = 0;
  let covered = 0;
  let oldLine = 1;
  let newLine = 1;
  const text = (line: string | undefined) => (line ?? "").replace(/\r?\n$/, "");
  function start(old: number, head: number) {
    if (rows.length === 0) {
      oldStart = old;
      newStart = head;
    }
  }
  function context(count: number, oldIndex: number, newIndex: number) {
    for (let offset = 0; offset < count; offset++) {
      const line = (side === "base" ? oldLine : newLine) + offset;
      if (line < from || line > to) continue;
      start(oldLine + offset, newLine + offset);
      rows.push({
        kind: "unchanged",
        text: text(
          side === "base"
            ? diff.deletionLines[oldIndex + offset]
            : diff.additionLines[newIndex + offset],
        ),
      });
      covered++;
    }
    oldLine += count;
    newLine += count;
  }
  for (const hunk of diff.hunks) {
    const old = hunk.deletionStart + (hunk.deletionCount === 0 ? 1 : 0);
    const head = hunk.additionStart + (hunk.additionCount === 0 ? 1 : 0);
    if (!diff.isPartial)
      context(
        Math.max(0, Math.min(old - oldLine, head - newLine)),
        oldLine - 1,
        newLine - 1,
      );
    oldLine = old;
    newLine = head;
    for (const block of hunk.hunkContent) {
      if (block.type === "context") {
        context(block.lines, block.deletionLineIndex, block.additionLineIndex);
        continue;
      }
      const count = side === "base" ? block.deletions : block.additions;
      const line = side === "base" ? oldLine : newLine;
      const first = Math.max(from, line);
      const last = Math.min(to, line + count - 1);
      if (first <= last) {
        covered += last - first + 1;
        const replacement = block.deletions > 0 && block.additions > 0;
        const offset = replacement ? 0 : first - line;
        start(
          oldLine + (block.deletions ? offset : 0),
          newLine + (block.additions ? offset : 0),
        );
        const deletions = replacement
          ? block.deletions
          : side === "base"
            ? last - first + 1
            : 0;
        const additions = replacement
          ? block.additions
          : side === "head"
            ? last - first + 1
            : 0;
        for (let index = 0; index < deletions; index++)
          rows.push({
            kind: "deleted",
            text: text(
              diff.deletionLines[block.deletionLineIndex + offset + index],
            ),
          });
        for (let index = 0; index < additions; index++)
          rows.push({
            kind: "added",
            text: text(
              diff.additionLines[block.additionLineIndex + offset + index],
            ),
          });
      }
      oldLine += block.deletions;
      newLine += block.additions;
    }
  }
  if (!diff.isPartial)
    context(
      Math.min(
        diff.deletionLines.length - oldLine + 1,
        diff.additionLines.length - newLine + 1,
      ),
      oldLine - 1,
      newLine - 1,
    );
  if (rows.length === 0 || covered !== to - from + 1) return undefined;
  return { oldPath, newPath, oldStart, newStart, rows };
}
