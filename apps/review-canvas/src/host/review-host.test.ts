import type {
  ReviewSurfaceEvent,
  ReviewVerbRequest,
} from "@blackboard/review-contracts";
import { testReviewBridge } from "@canvas/test/review-session-test-utils";
import { describe, expect, it, vi } from "vitest";

import { createReviewSurface } from "./review-host";

describe("review surface", () => {
  it("opens a source range in its narrowed commit comparison", () => {
    const posted: ReviewVerbRequest[] = [];
    const surface = createReviewSurface(
      testReviewBridge(
        {},
        {
          post: async (request) => {
            posted.push(request);
            return { ok: true };
          },
        },
      ),
    );
    surface.revealAnchor(
      "removed.ts",
      { fromLine: 1, toLine: 1 },
      "base",
      undefined,
      { commit: "abc" },
    );
    expect(posted[0]).toMatchObject({
      name: "reveal",
      args: { path: "removed.ts", side: "base", commit: "abc" },
    });
  });
  it("calls the typed workbench bridge directly", () => {
    const posted: ReviewVerbRequest[] = [];
    const listeners = new Set<(event: ReviewSurfaceEvent) => void>();
    const ready = vi.fn<() => void>();

    const bridge = testReviewBridge(
      {},
      {
        post: async (request) => {
          posted.push(request);

          return { ok: true };
        },
        subscribe: (listener) => {
          listeners.add(listener);

          return { dispose: () => listeners.delete(listener) };
        },
        ready,
      },
    );

    const reviewSurface = createReviewSurface(bridge);
    const events: ReviewSurfaceEvent[] = [];
    const unsubscribe = reviewSurface.subscribe((event) => events.push(event));

    bridge.ready();
    reviewSurface.openFileDiff({
      path: "src/new.ts",
      previousPath: "src/old.ts",
      status: "renamed",
      additions: 1,
      deletions: 1,
    });
    reviewSurface.revealAnchor(
      "src/old.ts",
      { fromLine: 7, toLine: 9 },
      "base",
    );

    for (const listener of listeners) {
      listener({ event: "themeChanged", theme: "dark" });
    }

    expect(ready).toHaveBeenCalledOnce();
    expect(posted).toEqual([
      {
        name: "openDiff",
        args: { path: "src/new.ts", previousPath: "src/old.ts" },
      },
      {
        name: "reveal",
        args: {
          path: "src/old.ts",
          startLine: 7,
          endLine: 9,
          side: "base",
          highlight: true,
          preserveFocus: false,
        },
      },
    ]);
    expect(events).toEqual([{ event: "themeChanged", theme: "dark" }]);
    unsubscribe();
  });
});
