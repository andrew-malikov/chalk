import type {
  ReviewCanvasBridge,
  ReviewCommitSummary,
  ReviewDiffFileWire,
} from "@blackboard/review-contracts";
import { ReviewSessionProvider } from "@canvas/host/review-session";
import { TestCanvasQuery } from "@canvas/test/canvas-query-test-utils";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
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
) {
  const container = document.createElement("div");
  container.className = "review-canvas-root";
  document.body.append(container);
  root = createRoot(container);

  await act(async () =>
    root!.render(
      <TestCanvasQuery>
        <ReviewSessionProvider session={testReviewSession({}, { diffView })}>
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

it("opens a commit's diff at the file clicked in its file list", async () => {
  const onOpenDiff =
    vi.fn<React.ComponentProps<typeof ReviewCommitsView>["onOpenDiff"]>();

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
    { files: async () => [file] },
  );

  await act(async () =>
    container.querySelector<HTMLButtonElement>("[aria-expanded]")!.click(),
  );

  const fileButton = await vi.waitFor(() => {
    const button = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes(file.path),
    );

    if (!button) throw new Error("file list not loaded");

    return button;
  });

  await act(async () => fileButton.click());

  expect(onOpenDiff).toHaveBeenCalledWith(commit, file.path);
});
