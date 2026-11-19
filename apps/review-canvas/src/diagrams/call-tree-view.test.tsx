// @vitest-environment jsdom

import {
  reviewSessionElement,
  testReviewSession,
} from "@canvas/test/review-session-test-utils";
import type { Frame } from "@review/documents/document";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { DocumentCallTree } from "./call-tree-view";

const frame = (
  id: string,
  side: "base" | "head" = "head",
  via?: Frame["via"],
): Frame => {
  const frame: Frame = {
    id,
    key: id,
    label: `Frame ${id}`,
    source: {
      file: `src/${id}.ts`,
      start: { side, line: 4 },
      end: { side, line: 9 },
    },
  };

  if (via) frame.via = via;

  return frame;
};

let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("DocumentCallTree", () => {
  it("opens a frame's source in a modal", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        reviewSessionElement(
          testReviewSession(),
          <DocumentCallTree
            block={{
              type: "call_stack_diff",
              id: "checkout",
              title: "Checkout",
              base: [
                frame("reconcile"),
                {
                  ...frame("auth", "base"),
                  contextSources: [
                    {
                      file: "context.ts",
                      start: { side: "head", line: 1 },
                      end: { side: "head", line: 2 },
                    },
                  ],
                  callSite: {
                    file: "caller.ts",
                    start: { side: "base", line: 12 },
                    end: { side: "base", line: 12 },
                  },
                },
              ],
              head: [
                frame("reconcile"),
                frame("enqueue", "head", {
                  kind: "queue",
                  reason: "via the workqueue",
                }),
              ],
            }}
          />,
        ),
      );
    });

    const removed = container.querySelector<HTMLButtonElement>(
      '[data-review-anchor-id="auth"]',
    )!;

    await act(async () => {
      removed.click();
    });

    const dialog = document.querySelector('[role="dialog"]');

    expect(dialog?.textContent).toContain("Frame auth");
    expect(dialog?.querySelector(".code-peek")).not.toBeNull();
  });
});
