import { expect, it } from "vitest";

import {
  createPierreSnippet,
  findPierreSnippet,
  pierreSnippetRows,
} from "./pierre-snippet";

function lines(diff: ReturnType<typeof createPierreSnippet>) {
  const result: Array<[number | undefined, number | undefined, string]> = [];

  for (const row of pierreSnippetRows(diff)) {
    const entries =
      row.type === "change"
        ? [
            [row.deletionLine, undefined],
            [undefined, row.additionLine],
          ]
        : [[row.deletionLine, row.additionLine]];

    for (const [deletionLine, additionLine] of entries) {
      if (!deletionLine && !additionLine) continue;
      result.push([
        deletionLine?.lineNumber,
        additionLine?.lineNumber,
        (additionLine
          ? diff.additionLines[additionLine.lineIndex]!
          : diff.deletionLines[deletionLine!.lineIndex]!
        ).trimEnd(),
      ]);
    }
  }

  return result;
}

it("keeps real line numbers for unchanged snippets and excludes distant text", () => {
  const text = Array.from({ length: 30 }, (_, i) => `line ${i + 1}\n`).join("");

  const diff = createPierreSnippet(
    "a.ts",
    text,
    text,
    [{ startLine: 12, endLine: 12 }],
    "head",
  );

  expect(lines(diff)).toEqual([
    [9, 9, "line 9"],
    [10, 10, "line 10"],
    [11, 11, "line 11"],
    [12, 12, "line 12"],
    [13, 13, "line 13"],
    [14, 14, "line 14"],
    [15, 15, "line 15"],
  ]);
});

it("aligns head ranges with their original lines after an insertion", () => {
  const before = Array.from({ length: 30 }, (_, i) => `line ${i + 1}\n`).join(
    "",
  );

  const after = `inserted\n${before}`;

  const diff = createPierreSnippet(
    "a.ts",
    before,
    after,
    [{ startLine: 12, endLine: 12 }],
    "head",
  );

  expect(lines(diff).map(([base, head]) => [base, head])).toEqual([
    [8, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [12, 13],
    [13, 14],
    [14, 15],
  ]);
});

it("keeps both changed sides, joins overlapping ranges, and searches context once", () => {
  const diff = createPierreSnippet(
    "a.ts",
    "same\nold needle\nlast\n",
    "same\nnew needle\nlast\n",
    [
      { startLine: 2, endLine: 2, side: "base" },
      { startLine: 2, endLine: 2, side: "head" },
    ],
    "head",
  );

  expect(lines(diff)).toEqual([
    [1, 1, "same"],
    [2, undefined, "old needle"],
    [undefined, 2, "new needle"],
    [3, 3, "last"],
  ]);
  expect(
    findPierreSnippet(diff, {
      text: "needle|same",
      isRegex: true,
      wholeWord: false,
      matchCase: false,
    }),
  ).toHaveLength(3);
});

it("supports added and deleted sources and multiline search", () => {
  for (const [before, after] of [
    ["", "one\ntwo\n"],
    ["one\ntwo\n", ""],
  ]) {
    const diff = createPierreSnippet(
      "a.ts",
      before!,
      after!,
      [{ startLine: 1, endLine: 2 }],
      before ? "base" : "head",
    );

    const matches = findPierreSnippet(diff, {
      text: "one\ntwo",
      isRegex: false,
      wholeWord: false,
      matchCase: false,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      startLine: 1,
      endLine: 2,
      side: before ? "base" : "head",
    });
  }
});

it("searches multiline changes on each source side, including adjacent context", () => {
  const diff = createPierreSnippet(
    "a.ts",
    "before\nold one\nold two\nafter\n",
    "before\nnew one\nnew two\nafter\n",
    [{ startLine: 2, endLine: 3 }],
    "head",
  );

  const query = {
    text: "old one\nold two\nafter",
    isRegex: false,
    wholeWord: false,
    matchCase: false,
  };

  expect(findPierreSnippet(diff, query)).toEqual([
    { side: "base", startLine: 2, endLine: 4, startColumn: 0, endColumn: 5 },
  ]);
});
