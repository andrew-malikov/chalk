import type { StructuralDiff, StructuralRegion } from "@chalk/review-contracts";
import { expect, it } from "vitest";

import { loadPierreComparison } from "./pierre-comparison";
import { selectedPierreDiff } from "./pierre-selection";
import { structuralMetadata } from "./structural-comparison";

type TextDiff = Extract<StructuralDiff, { type: "text" }>;

const at = (line: number) => ({ line, column: 0 });

const fold = (
  id: number,
  tags: string[],
  [from, to]: [number, number],
  children: StructuralRegion[] = [],
): StructuralRegion => ({
  id,
  fold_state_id: id,
  kind: "fold",
  tags,
  indent: at(from),
  start: at(from),
  end: at(to),
  children,
});

const root = (children: StructuralRegion[] = []) =>
  fold(0, [], [0, 0], children);

const text = (value: string) => ({ text: value, root: root() });

const diff: TextDiff = {
  type: "text",
  lhs: text(
    "function answer() {\n  return 1;\n}\n\nfunction unchanged() {\n  return 5;\n}\n",
  ),
  rhs: text(
    "function answer() {\n  return 2;\n}\n\nfunction unchanged() {\n    return 5;\n}\n",
  ),
  stats: {
    textual: { added: 2, removed: 2 },
    visible: { added: 1, removed: 1 },
  },
  structural_changes: { base: [[1, 2]], head: [[1, 2]] },
};

const scope = fold(
  1,
  ["context:scope"],
  [0, 3],
  [fold(10, ["context:body"], [1, 2])],
);

diff.rhs!.root = root([scope]);

it("renders the changed function and preserves original lines while suppressing formatting edits", () => {
  const metadata = structuralMetadata(diff, "renamed.ts", "before.ts")!;
  expect(metadata.name).toBe("renamed.ts");
  expect(metadata.prevName).toBe("before.ts");
  expect(metadata.hunks[0]!.hunkContext).toBe("function answer() {");
  expect(
    selectedPierreDiff(metadata, "head", 2, 2, "before.ts", "renamed.ts"),
  ).toEqual({
    oldPath: "before.ts",
    newPath: "renamed.ts",
    oldStart: 2,
    newStart: 2,
    rows: [
      { kind: "deleted", text: "  return 1;" },
      { kind: "added", text: "  return 2;" },
    ],
  });
  expect(
    metadata.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0),
  ).toBe(1);
  expect(metadata.additionLines[5]).toBe("    return 5;\n");
  expect(
    selectedPierreDiff(metadata, "head", 6, 6, "before.ts", "renamed.ts")?.rows,
  ).toEqual([{ kind: "unchanged", text: "    return 5;" }]);
  expect(
    structuralMetadata(
      { ...diff, structural_changes: { base: [], head: [] } },
      "a.ts",
    ),
  ).toBeUndefined();
});

it("handles additions, deletions, empty files, and files without a final newline", () => {
  for (const side of ["lhs", "rhs"] as const) {
    const oneSide: TextDiff = {
      type: "text",
      ...(side === "lhs"
        ? { lhs: text("return 2;") }
        : { rhs: text("return 2;") }),
      stats: diff.stats,
      structural_changes: {
        base: side === "lhs" ? [[0, 1]] : [],
        head: side === "rhs" ? [[0, 1]] : [],
      },
    };

    const metadata = structuralMetadata(oneSide, "a.ts")!;
    expect(metadata.type).toBe(side === "lhs" ? "deleted" : "new");
    expect(
      selectedPierreDiff(
        metadata,
        side === "lhs" ? "base" : "head",
        1,
        1,
        "a.ts",
        "a.ts",
      )?.rows,
    ).toEqual([
      { kind: side === "lhs" ? "deleted" : "added", text: "return 2;" },
    ]);
  }

  expect(
    structuralMetadata(
      {
        ...diff,
        lhs: text(""),
        rhs: text(""),
        structural_changes: { base: [], head: [] },
      },
      "a.ts",
    ),
  ).toBeUndefined();
});

it("streams chunked UTF-8 for the pinned comparison and reports incomplete or failed outcomes", async () => {
  const file = {
    path: "a.ts",
    status: "modified" as const,
    additions: 2,
    deletions: 2,
  };

  const record = {
    type: "file",
    file: { rhs: { path: "a.ts", oid: "", mode: "" } },
    diff: {
      ...diff,
      rhs: { ...diff.rhs, text: diff.rhs!.text.replace("answer", "réponse") },
    },
  };

  const complete = { type: "complete", succeeded: 1, failed: 0 };

  async function load(records: unknown[]) {
    return loadPierreComparison({
      files: [file],
      url: "http://localhost/reviews-api/id/diff?version=7&commit=abc",
      structural: true,
      signal: new AbortController().signal,
      onUpdate() {},
      request: async (url) => {
        expect(new URL(url).pathname).toBe("/reviews-api/id/structural-diff");
        expect(new URL(url).searchParams.get("version")).toBe("7");
        expect(new URL(url).searchParams.get("commit")).toBe("abc");
        expect(new URL(url).searchParams.get("file")).toBe("a.ts");

        const bytes = new TextEncoder().encode(
          records.map((x) => JSON.stringify(x)).join("\n"),
        );

        return new Response(
          new ReadableStream({
            start(controller) {
              for (let i = 0; i < bytes.length; i += 7)
                controller.enqueue(bytes.slice(i, i + 7));
              controller.close();
            },
          }),
        );
      },
    });
  }

  expect((await load([record, complete]))[0]!.diff?.additionLines[0]).toContain(
    "réponse",
  );
  expect((await load([record]))[0]!.error).toContain("Incomplete");
  expect(
    (await load([{ type: "error", message: "Engine unavailable" }]))[0]!.error,
  ).toBe("Engine unavailable");
  expect(
    (
      await load([
        {
          ...record,
          diff: undefined,
          error: { code: "unsupported", message: "Unsupported syntax" },
        },
        complete,
      ])
    )[0]!.error,
  ).toBe("Unsupported syntax");
});

it("separates adjacent changed functions and keeps selection coordinates in later hunks", () => {
  const secondScope: StructuralRegion = {
    ...scope,
    id: 2,
    fold_state_id: 2,
    start: { line: 4, column: 0 },
    end: { line: 7, column: 0 },
  };

  const both: TextDiff = {
    ...diff,
    rhs: {
      ...diff.rhs!,
      text: diff.rhs!.text.replace("return 5", "return 6"),
      root: root([scope, secondScope]),
    },
    structural_changes: {
      base: [
        [1, 2],
        [5, 6],
      ],
      head: [
        [1, 2],
        [5, 6],
      ],
    },
  };

  const metadata = structuralMetadata(both, "a.ts")!;
  expect(metadata.hunks.map((hunk) => hunk.hunkContext)).toEqual([
    "function answer() {",
    "function unchanged() {",
  ]);
  expect(
    selectedPierreDiff(metadata, "head", 6, 6, "a.ts", "a.ts"),
  ).toMatchObject({
    oldStart: 6,
    newStart: 6,
    rows: [
      { kind: "deleted", text: "  return 5;" },
      { kind: "added", text: "    return 6;" },
    ],
  });
});

it("keeps adjacent edits in one hunk when diffr scopes each statement", () => {
  const before = "function f() {\n  a();\n  b();\n}\n";
  const after = "function f() {\n  a(1);\n  b(1);\n}\n";

  const metadata = structuralMetadata(
    {
      ...diff,
      lhs: text(before),
      rhs: {
        text: after,
        root: root([
          fold(
            1,
            ["context:scope"],
            [0, 4],
            [
              fold(
                2,
                ["context:body"],
                [1, 3],
                [
                  fold(3, ["context:scope"], [1, 2]),
                  fold(4, ["context:scope"], [2, 3]),
                ],
              ),
            ],
          ),
        ]),
      },
      structural_changes: { base: [[1, 3]], head: [[1, 3]] },
    },
    "a.ts",
  )!;

  expect(metadata.hunks).toHaveLength(1);
});

it("cancels a pending structural stream when the comparison is superseded", async () => {
  const abort = new AbortController();
  let cancelled = false;

  const loading = loadPierreComparison({
    files: [{ path: "a.ts", status: "modified", additions: 1, deletions: 1 }],
    url: "http://localhost/reviews-api/id/diff",
    structural: true,
    signal: abort.signal,
    onUpdate() {},
    request: async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });

  const rejected = loading.catch((error: Error) => error);
  await new Promise((resolve) => setTimeout(resolve, 0));
  abort.abort();
  expect(await rejected).toMatchObject({ name: "AbortError" });
  expect(cancelled).toBe(true);
});

it("loads the text patch when diffr falls back to lines", async () => {
  const fallback = {
    type: "file",
    file: { lhs: { path: "a.cs", oid: "", mode: "" } },
    diff: {
      ...diff,
      stats: {
        ...diff.stats,
        fallback: { code: "parse_error", message: "C# parse errors" },
      },
    },
  };

  const [entry] = await loadPierreComparison({
    files: [{ path: "a.cs", status: "modified", additions: 1, deletions: 1 }],
    url: "http://localhost/reviews-api/id/diff",
    structural: true,
    signal: new AbortController().signal,
    onUpdate() {},
    request: async (url) =>
      new URL(url).pathname.endsWith("/structural-diff")
        ? new Response(
            [fallback, { type: "complete", succeeded: 1, failed: 0 }]
              .map((x) => JSON.stringify(x))
              .join("\n"),
          )
        : new Response(
            "--- a/a.cs\n+++ b/a.cs\n@@ -1 +1 @@\n-before\n+after\n",
          ),
  });

  expect(entry!.error).toBeUndefined();
  expect(entry!.diff?.additionLines).toEqual(["after\n"]);
});
