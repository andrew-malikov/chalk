import { FileDiff, parsePatchFiles } from "@pierre/diffs";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { selectedPierreText } from "./pierre-text-selection";

it.each(["split", "unified"] as const)(
  "maps native text selections to source lines in %s diffs",
  async (diffStyle) => {
    const element = document.createElement("div");
    document.body.append(element);
    const diff = new FileDiff({ diffStyle, preferredHighlighter: "shiki-js" });
    diff.render({
      fileDiff: parsePatchFiles(
        "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,3 +1,3 @@\n before\n-old\n+new\n after\n",
      )[0]!.files[0]!,
      containerWrapper: element,
    });
    const host = element.querySelector<HTMLElement>("diffs-container")!;
    const items = [{ id: "a.ts", element: host }];
    const selection = document.getSelection()!;

    const select = (start: Node, from: number, end: Node, to: number) =>
      selection.setBaseAndExtent(start, from, end, to);

    try {
      await vi.waitFor(() =>
        expect(
          host.shadowRoot!.querySelector('[data-line="3"]'),
        ).not.toBeNull(),
      );

      const rows = host.shadowRoot!.querySelectorAll<HTMLElement>(
        "[data-code] [data-line]",
      );

      const added = [...rows].find(
        (row) => row.dataset.lineType === "change-addition",
      )!;

      const deleted = [...rows].find(
        (row) => row.dataset.lineType === "change-deletion",
      )!;

      const after = [...rows].find(
        (row) => row.dataset.line === "3" && !row.closest("[data-deletions]"),
      )!;

      await userEvent.dragAndDrop(
        added.firstElementChild!,
        after.lastElementChild!,
        {
          sourcePosition: { x: 1, y: 7 },
          targetPosition: {
            x: after.lastElementChild!.getBoundingClientRect().width - 1,
            y: 7,
          },
        },
      );
      expect(selectedPierreText(items)).toMatchObject({
        id: "a.ts",
        range: { start: 2, end: 3, side: "additions" },
      });
      const forward = selectedPierreText(items)!;
      const end = after.lastElementChild!.getBoundingClientRect();
      expect(Math.abs(forward.anchor.x - end.right)).toBeLessThan(8);
      expect(forward.anchor.y).toBeGreaterThanOrEqual(end.top);
      expect(forward.anchor.y).toBeLessThanOrEqual(end.bottom);
      selection.removeAllRanges();
      await userEvent.dragAndDrop(
        after.lastElementChild!,
        added.firstElementChild!,
        {
          sourcePosition: {
            x: after.lastElementChild!.getBoundingClientRect().width - 1,
            y: 7,
          },
          targetPosition: { x: 1, y: 7 },
        },
      );
      expect(selectedPierreText(items)?.range).toEqual({
        start: 2,
        end: 3,
        side: "additions",
      });
      const backward = selectedPierreText(items)!;
      const start = added.firstElementChild!.getBoundingClientRect();
      expect(Math.abs(backward.anchor.x - start.left)).toBeLessThan(8);
      expect(backward.anchor.y).toBeGreaterThanOrEqual(start.top);
      expect(backward.anchor.y).toBeLessThanOrEqual(start.bottom);
      select(added, 0, after, 0);
      expect(selectedPierreText(items)?.range.end).toBe(2);
      select(deleted, 0, deleted, deleted.childNodes.length);
      expect(selectedPierreText(items)?.range).toEqual({
        start: 2,
        end: 2,
        side: "deletions",
      });
      select(deleted, 0, added, added.childNodes.length);
      expect(selectedPierreText(items)).toBeNull();
      selection.removeAllRanges();
      expect(selectedPierreText(items)).toBeNull();
    } finally {
      selection.removeAllRanges();
      diff.cleanUp();
      element.remove();
    }
  },
);
