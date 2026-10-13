import type { ReviewDiffFileWire } from "@blackboard/review-protocol";
import { parsePatchFiles } from "@pierre/diffs";
import { describe, expect, it, vi } from "vitest";

import {
  loadPierreComparison,
  loadPierreFile,
  type PierreComparisonEntry,
} from "./pierre-comparison";

const file: ReviewDiffFileWire = {
  path: "src/a.ts",
  status: "modified",
  additions: 1,
  deletions: 1,
};
const patch =
  "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-before\n+after\n";

describe("Pierre comparison loading", () => {
  it("publishes parsed files progressively, prioritizes navigation, and preserves manifest order", async () => {
    const files = [
      file,
      { ...file, path: "src/b.ts" },
      { ...file, path: "src/c.ts" },
    ];
    const requested: URL[] = [];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const updates: string[][] = [];
    const published: PierreComparisonEntry[][] = [];
    const loading = loadPierreComparison({
      files,
      url: "http://localhost/reviews-api/review/diff?version=3&commit=abc",
      signal: new AbortController().signal,
      preferredFile: () => "src/c.ts",
      request: async (url) => {
        const parsed = new URL(url);
        requested.push(parsed);
        if (parsed.searchParams.get("file") === "src/a.ts") await blocked;
        const path = parsed.searchParams.get("file")!;
        return new Response(patch.replaceAll("src/a.ts", path));
      },
      onUpdate: (entries) => {
        published.push(entries);
        updates.push(
          entries.filter((entry) => entry.diff).map((entry) => entry.file.path),
        );
      },
    });
    await vi.waitFor(() =>
      expect(updates.some((paths) => paths.includes("src/c.ts"))).toBe(true),
    );
    expect(requested[0]!.searchParams.get("file")).toBe("src/c.ts");
    expect(
      requested.every(
        (url) =>
          url.searchParams.get("version") === "3" &&
          url.searchParams.get("commit") === "abc" &&
          url.searchParams.get("maxBytes") === "500000",
      ),
    ).toBe(true);
    release();
    const entries = await loading;
    expect(entries.map((entry) => entry.file.path)).toEqual(
      files.map((file) => file.path),
    );
    expect(entries.map((entry) => entry.diff?.name)).toEqual(
      files.map((file) => file.path),
    );
    expect(published[0]![0]!.diff).toBeUndefined();
  });

  it("keeps binary and failed files navigable without fabricating rendered hunks", async () => {
    const request = vi.fn(async () =>
      Response.json({ error: "Patch exceeds byte limit" }, { status: 409 }),
    );
    const entries = await loadPierreComparison({
      files: [
        { ...file, binary: true },
        { ...file, path: "big.ts" },
      ],
      url: "http://localhost/reviews-api/review/diff",
      signal: new AbortController().signal,
      request,
      onUpdate: () => {},
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(entries[0]).toMatchObject({ notice: "Binary file" });
    expect(entries[1]).toMatchObject({ error: "Patch exceeds byte limit" });
    expect(entries.every((entry) => entry.diff === undefined)).toBe(true);
  });

  it("does not publish a superseded comparison after an abort", async () => {
    const abort = new AbortController();
    const onUpdate = vi.fn();
    const loading = loadPierreComparison({
      files: [file],
      url: "http://localhost/reviews-api/review/diff",
      signal: abort.signal,
      request: async () => {
        abort.abort();
        return new Response(patch);
      },
      onUpdate,
    });
    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("committed comparison expansion", () => {
  it("loads both immutable source sides with the old rename name and comparison identity", async () => {
    const diff = parsePatchFiles(patch, undefined, true)[0]!.files[0]!;
    diff.name = "new.ts";
    diff.prevName = "old.ts";
    const requested: URL[] = [];
    const result = await loadPierreFile(
      diff,
      "http://localhost/reviews-api/review/diff?version=3&commit=abc",
      async (url) => {
        const source = new URL(url);
        requested.push(source);
        return Response.json({
          text:
            source.searchParams.get("side") === "base" ? "before\n" : "after\n",
        });
      },
      new AbortController().signal,
    );
    expect(
      requested.map((url) => [
        url.pathname,
        url.searchParams.get("file"),
        url.searchParams.get("side"),
        url.searchParams.get("version"),
        url.searchParams.get("commit"),
      ]),
    ).toEqual([
      ["/reviews-api/review/file", "old.ts", "base", "3", "abc"],
      ["/reviews-api/review/file", "new.ts", "head", "3", "abc"],
    ]);
    expect(result.oldFile).toMatchObject({
      name: "old.ts",
      contents: "before\n",
    });
    expect(result.newFile).toMatchObject({
      name: "new.ts",
      contents: "after\n",
    });
  });

  it("hydrates a pure rename from only the head source", async () => {
    const diff = parsePatchFiles(
      "diff --git a/old.ts b/new.ts\nsimilarity index 100%\nrename from old.ts\nrename to new.ts\n",
      undefined,
      true,
    )[0]!.files[0]!;
    const request = vi.fn(async () => Response.json({ text: "unchanged\n" }));
    const result = await loadPierreFile(
      diff,
      "http://localhost/reviews-api/review/diff?commit=abc",
      request,
      new AbortController().signal,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.oldFile).toBeNull();
    expect(result.newFile).toMatchObject({
      name: "new.ts",
      contents: "unchanged\n",
    });
  });
});
