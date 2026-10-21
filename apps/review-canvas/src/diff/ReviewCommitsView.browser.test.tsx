import { ReviewSessionProvider } from "@canvas/host/review-session";
import { TestCanvasQuery } from "@canvas/test/canvas-query-test-utils";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import type {
  ReviewCanvasBridge,
  ReviewCommitSummary,
  ReviewDiffFileWire,
} from "@chalk/review-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { ReviewCommitsView } from "./ReviewCommitsView";

import "@canvas/styles.css";

let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

const commit: ReviewCommitSummary = {
  commit: "c".repeat(40),
  parentCommit: "p".repeat(40),
  subject: "Change the thing",
  author: "Developer",
  authoredAt: new Date(2026, 8, 23, 12).toISOString(),
  fileCount: 1,
  additions: 3,
  deletions: 1,
};

const file: ReviewDiffFileWire = {
  path: "src/thing.ts",
  status: "modified",
  additions: 3,
  deletions: 1,
};

async function mount(
  element: React.ReactElement,
  diffView: ReviewCanvasBridge["diffView"],
  request?: ReviewCanvasBridge["request"],
) {
  const container = document.createElement("div");
  container.className = "review-canvas-root";
  document.body.append(container);
  root = createRoot(container);

  await act(async () =>
    root!.render(
      <TestCanvasQuery>
        <ReviewSessionProvider session={testReviewSession({}, { diffView, request })}>
          {element}
        </ReviewSessionProvider>
      </TestCanvasQuery>,
    ),
  );

  return container;
}

it("aligns commit subjects with their metadata at different row widths", async () => {
  const container = await mount(
    <ReviewCommitsView
      commits={[commit]}
      range={{
        baseRef: "main",
        headRef: "feature",
        baseCommit: "base",
        headCommit: commit.commit,
      }}
      onOpenDiff={() => {}}
    />,
    { files: async () => [file] },
  );

  for (const width of [1000, 500]) {
    container.style.width = `${width}px`;
    const subject = container.querySelector("button strong")!;
    const meta = container.querySelector("article > div > span:last-child")!;
    const metadataText = document.createRange();
    metadataText.selectNodeContents(meta);
    expect(
      Math.abs(
        subject.getBoundingClientRect().left -
          metadataText.getBoundingClientRect().left,
      ),
    ).toBeLessThan(1);
  }
});

it("shows a clicked file's diff inline and lists omitted files in place", async () => {
  const onOpenDiff =
    vi.fn<React.ComponentProps<typeof ReviewCommitsView>["onOpenDiff"]>();

  const testFile = { ...file, path: "src/thing.test.ts" };

  const container = await mount(
    <ReviewCommitsView
      commits={[commit]}
      range={{
        baseRef: "main",
        headRef: "feature",
        baseCommit: "a".repeat(40),
        headCommit: commit.commit,
      }}
      onOpenDiff={onOpenDiff}
    />,
    { files: async () => [file, testFile] },
    async () =>
      new Response(
        "diff --git a/src/thing.ts b/src/thing.ts\n--- a/src/thing.ts\n+++ b/src/thing.ts\n@@ -1 +1 @@\n-before\n+after\n",
      ),
  );

  await act(async () =>
    container.querySelector<HTMLButtonElement>("[aria-expanded]")!.click(),
  );

  const button = (text: string) =>
    vi.waitFor(() => {
      const found = [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes(text),
      );

      if (!found) throw new Error(`${text} not shown`);

      return found;
    });

  await act(async () => (await button(file.path)).click());

  await vi.waitFor(() => {
    if (!container.querySelector("diffs-container"))
      throw new Error("diff not shown");
  });

  expect(container.textContent).not.toContain(testFile.path);

  await act(async () => (await button("1 more file")).click());

  expect(container.textContent).toContain(testFile.path);
  expect(container.textContent).not.toContain("more file");
  expect(onOpenDiff).not.toHaveBeenCalled();
});
