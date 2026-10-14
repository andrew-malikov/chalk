import { testReviewSession } from "@canvas/test/review-session-test-utils";
import type { ReviewInlineEditorHandle } from "@chalk/review-contracts";
import { afterEach, expect, it, vi } from "vitest";

import { createPierreInlineEditors } from "./pierre-inline-editors";

import "@canvas/styles.css";

let editor: ReviewInlineEditorHandle | undefined;

afterEach(() => editor?.dispose());

it.each([
  { status: "added", before: "", after: "const added = true;\n".repeat(30) },
  {
    status: "deleted",
    before: "const removed = true;\n".repeat(30),
    after: "",
  },
  {
    status: "modified",
    before: "const same = true;\n".repeat(30),
    after: "const same = true;\n".repeat(30),
  },
  {
    status: "modified",
    before: "const value = 1;\n".repeat(30),
    after: "const value = 2;\n".repeat(30),
  },
] as const)(
  "renders $status source at the width needed for its comparison",
  async ({ status, before, after }) => {
    const container = document.createElement("div");
    container.className = "review-canvas-root";
    container.style.width = "800px";
    document.body.append(container);

    const session = testReviewSession(
      {},
      {
        request: async (source) => {
          const url = new URL(source);

          return Response.json(
            url.pathname.endsWith("/diff")
              ? [{ path: "source.ts", status, additions: 30, deletions: 0 }]
              : {
                  text:
                    url.searchParams.get("side") === "base" ? before : after,
                },
          );
        },
      },
    );

    editor = createPierreInlineEditors(session).create({
      container,
      path: "source.ts",
      title: "source.ts",
      side: status === "deleted" ? "base" : "head",
      ranges: [{ startLine: 1, endLine: 30 }],
      heightMode: "capped",
      active: true,
    });
    await vi.waitFor(() => {
      const code = container
        .querySelector("diffs-container")
        ?.shadowRoot?.querySelector("[data-code]");

      expect(code).toBeTruthy();
      expect(code!.getBoundingClientRect().width > 600).toBe(
        status !== "modified" || before === after,
      );
    });
    const body = container.querySelector<HTMLDivElement>("div[aria-label]")!;
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
    body.scrollTop = 100;
    expect(body.scrollTop).toBeGreaterThan(0);
  },
);
