import { hydratePartialDiff, parsePatchFiles } from "@pierre/diffs";
import { expect, it } from "vitest";

import { selectedPierreDiff } from "./pierre-selection";

const parse = (body: string) =>
  parsePatchFiles(
    `diff --git a/old.ts b/new.ts\n--- a/old.ts\n+++ b/new.ts\n${body}`,
    undefined,
    true,
  )[0]!.files[0]!;

it("includes both sides of a selected replacement and keeps the renamed paths", () => {
  const diff = parse("@@ -1,3 +1,3 @@\n before\n-old\n+new\n after\n");
  expect(selectedPierreDiff(diff, "head", 2, 2, "old.ts", "new.ts")).toEqual({
    oldPath: "old.ts",
    newPath: "new.ts",
    oldStart: 2,
    newStart: 2,
    rows: [
      { kind: "deleted", text: "old" },
      { kind: "added", text: "new" },
    ],
  });
});

it("keeps a selection of a pure addition partial, including its empty text line", () => {
  const diff = parse("@@ -0,0 +1,3 @@\n+first\n+\n+last\n");
  expect(selectedPierreDiff(diff, "head", 2, 2, "", "new.ts")).toEqual({
    oldPath: "",
    newPath: "new.ts",
    oldStart: 1,
    newStart: 2,
    rows: [{ kind: "added", text: "" }],
  });
});

it("never represents unloaded context as contiguous diff rows, then includes it after hydration", () => {
  const diff = parse("@@ -1 +1 @@\n-old\n+new\n@@ -4 +4 @@\n-last\n+end\n");
  expect(
    selectedPierreDiff(diff, "head", 1, 4, "old.ts", "new.ts"),
  ).toBeUndefined();
  hydratePartialDiff("merge", diff, {
    oldFile: { name: "old.ts", contents: "old\nmiddle\n\nlast\n" },
    newFile: { name: "new.ts", contents: "new\nmiddle\n\nend\n" },
  });
  expect(
    selectedPierreDiff(diff, "head", 1, 4, "old.ts", "new.ts")?.rows,
  ).toEqual([
    { kind: "deleted", text: "old" },
    { kind: "added", text: "new" },
    { kind: "unchanged", text: "middle" },
    { kind: "unchanged", text: "" },
    { kind: "deleted", text: "last" },
    { kind: "added", text: "end" },
  ]);
});
