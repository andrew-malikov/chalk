import type { ReviewVerbRequest } from "@blackboard/review-protocol";
import {
  type ReviewSession,
  ReviewSessionProvider,
} from "@canvas/host/review-session";
import type { ReviewLensView } from "@canvas/review/review-lenses";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import { selectSource, sourceAnchors } from "@review/documents/lens-selection";
import { type ReactNode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodePeekCard } from "./CodePeek";

const testLenses: ReviewLensView = {
  progress: null,
  error: null,
  resolve: (selections) => selections.flatMap(sourceAnchors),
};

let root: ReturnType<typeof createRoot> | undefined;

let posted: ReviewVerbRequest[] = [];

let session: ReviewSession;

beforeEach(() => {
  posted = [];
  session = createTestSession();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CodePeek source navigation", () => {
  it("opens the pinned source side and range from its preview action", async () => {
    const input = {
      side: "base",
      file: "src/previous.ts",
      fromLine: 7,
      toLine: 9,
    } as const;

    const secondInput = {
      side: "head",
      file: "src/current.ts",
      fromLine: 20,
      toLine: 20,
    } as const;

    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () =>
      renderWithSession(
        <>
          <CodePeekCard source={selectSource(input)} lenses={testLenses} />
          <CodePeekCard
            source={selectSource(secondInput)}
            lenses={testLenses}
          />
        </>,
      ),
    );
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(
        container.querySelector("[data-review-inline-editor] button"),
      ).not.toBeNull();
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("[data-review-inline-editor] button")!
        .click();
    });

    expect(posted.at(-1)).toEqual({
      name: "reveal",
      args: {
        path: "src/previous.ts",
        startLine: 7,
        endLine: 9,
        side: "base",
        highlight: true,
        preserveFocus: false,
      },
    });
  });
});

function renderWithSession(node: ReactNode) {
  root!.render(
    <ReviewSessionProvider session={session}>{node}</ReviewSessionProvider>,
  );
}

function createTestSession(reviewId = "test"): ReviewSession {
  return testReviewSession(
    { reviewId, token: "" },
    {
      diffView: {
        files: async () => [],
      },
      request: async (url) =>
        Response.json(
          new URL(String(url)).pathname.endsWith("/diff") ? [] : { text: "" },
        ),
      post: async (request) => {
        posted.push(request);

        return { ok: true };
      },
      subscribe: () => ({ dispose() {} }),
      currentTheme: () => "dark",
      onDidChangeTheme: () => ({ dispose() {} }),
      currentDiffLayout: () => "split",
      async setDiffLayout() {},
      onDidChangeDiffLayout: () => ({ dispose() {} }),
      ready() {},
    },
  );
}
