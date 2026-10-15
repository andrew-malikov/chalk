import { expect, it } from "vitest";

import { fileTreeRows } from "./file-tree";

it("nests files under folded directories, directories first", () => {
  const rows = fileTreeRows(
    ["README.md", "src/diff/a.ts", "src/diff/b.ts", "src/lib/c.ts"].map(
      (path) => ({ file: { path } }),
    ),
  );

  expect(rows.map((row) => [row.depth, row.name, !!row.entry])).toEqual([
    [0, "src", false],
    [1, "diff", false],
    [2, "a.ts", true],
    [2, "b.ts", true],
    [1, "lib", false],
    [2, "c.ts", true],
    [0, "README.md", true],
  ]);
  expect(
    fileTreeRows([{ file: { path: "apps/canvas/src/x.ts" } }]).map(
      (row) => row.name,
    ),
  ).toEqual(["apps/canvas/src", "x.ts"]);
});
