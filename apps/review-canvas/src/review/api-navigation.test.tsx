// @vitest-environment jsdom
import { randomUUID } from "node:crypto";

import { createReviewApi } from "@blackboard/server/review-api/http";
import { mountReviewCanvas } from "@canvas/desktop-entry";
import { testReviewBridge } from "@canvas/test/review-session-test-utils";
import { ReviewStore } from "@review/node/review-api/store";
import { Hono } from "hono";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let canvas: ReturnType<typeof mountReviewCanvas> | undefined;

let store: ReviewStore;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(async () => {
  await act(async () => canvas?.dispose());
  await store?.close();
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it("exposes JSON section and Markdown headings with table of contents navigation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  store = new ReviewStore(":memory:", {
    validatePins: async () => {},
    validateSource: async () => {},
    validateResource: async () => {},
  });

  const { reviewId } = await store.execute(
    {
      commandId: randomUUID(),
      operation: {
        type: "create",
        title: "Navigation",
        pins: { repositoryId: "repo", base: "base", head: "head" },
      },
    },
    {
      origin: {},
      document: [
        { type: "markdown", markdown: "## Summary\n\nText\n\n### **Details**" },
        {
          type: "section",
          title: "Implementation",
          children: [
            { type: "markdown", markdown: "## Details\n\nNested text" },
          ],
        },
      ],
    },
  );

  const app = new Hono();
  app.route("/reviews-api", createReviewApi(store));
  app.get("/reviews-api/:id/commits", (c) => c.json([]));
  const post = vi.fn<() => Promise<{ ok: true }>>(async () => ({ ok: true }));

  const bridge = testReviewBridge(
    {},
    {
      request: async (url, init) => app.request(url, init),
      post,
      diffView: {
        files: async () => [],
      },
    },
  );

  const container = document.createElement("div");
  document.body.append(container);
  await act(async () => {
    canvas = mountReviewCanvas(container, { kind: "api", reviewId, bridge });
  });
  await act(async () => {
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Nested text"),
    );
  });
  const headings = [...container.querySelectorAll("article h2, article h3")];
  expect(headings.map((heading) => heading.textContent)).toEqual([
    "Summary",
    "Details",
    "Implementation",
    "Details",
  ]);
  // Repeated headings get unique fragment IDs.
  expect(headings.map((heading) => heading.id)).toEqual([
    "summary",
    "details",
    "implementation",
    "details-2",
  ]);

  const contents = container.querySelector<HTMLButtonElement>(
    '[aria-controls="review-toc-body"]',
  )!;

  expect(contents).toBeTruthy();
  await act(async () => contents.click());

  const links = [
    ...container.querySelectorAll<HTMLButtonElement>("#review-toc li > button"),
  ];

  expect(
    links.map((link) => link.querySelector("span:last-child")?.textContent),
  ).toEqual(headings.map((heading) => heading.textContent));
  const scroll = vi.fn<() => void>();
  container.querySelectorAll<HTMLElement>("*").forEach((element) => {
    element.scrollTo = scroll;
    element.scrollIntoView = scroll;
  });

  for (const link of links) await act(async () => link.click());
  expect(scroll).toHaveBeenCalledTimes(4);
});
