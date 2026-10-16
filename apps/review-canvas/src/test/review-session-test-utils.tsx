import type { ApiDocumentData } from "@canvas/documents/api-document";
import { apiHeadingIds } from "@canvas/documents/api-document-headings";
import { reviewFetchUrl } from "@canvas/host/review-client";
import {
  type ReviewSession,
  ReviewSessionProvider,
  createReviewSession,
} from "@canvas/host/review-session";
import type {
  ReviewCanvasBridge,
  ReviewDiffPreferences,
  ReviewRuntimeConfig,
} from "@chalk/review-contracts";
import type { Block } from "@review/documents/document";
import type { ReactNode } from "react";

export const TEST_REVIEW_CONFIG = {
  serverUrl: "http://127.0.0.1:5570",
  reviewId: "test-session",
  token: "secret-token",
  wasmUrl: "vscode-file://review/libavoid.wasm",
  appVersion: "0.0.13",
  theme: "dark",
  host: "desktop",
} satisfies ReviewRuntimeConfig;

// Writes apply at once and report back through the change event, like the
// desktop does.
export function testDiffPreferences(
  initial: Partial<ReviewDiffPreferences> = {},
): Pick<
  ReviewCanvasBridge,
  "diffPreference" | "setDiffPreference" | "onDidChangeDiffPreference"
> {
  const values: ReviewDiffPreferences = {
    layout: "split",
    mode: "text",
    wrap: false,
    ...initial,
  };

  const listeners = new Set<() => void>();

  return {
    diffPreference: (key) => values[key],
    async setDiffPreference(key, value) {
      values[key] = value;

      for (const listener of listeners) listener();
    },
    onDidChangeDiffPreference: (key, listener) => {
      const notify = () => listener(values[key]);
      listeners.add(notify);

      return { dispose: () => listeners.delete(notify) };
    },
  };
}

export function testReviewBridge(
  config: Partial<ReviewRuntimeConfig> = {},
  overrides: Partial<Omit<ReviewCanvasBridge, "config">> = {},
): ReviewCanvasBridge {
  return {
    config: { ...TEST_REVIEW_CONFIG, ...config },
    diffView: {
      files: async () => [],
    },
    inlineEditors: {
      async find() {
        return { matchCount: 0 };
      },
      create: () => {
        throw new Error("unused test inline editor");
      },
    },
    request: (url, init) => reviewFetchUrl({}, url, init),
    post: async () => ({ ok: true }),
    subscribe: () => ({ dispose() {} }),
    currentTheme: () => "dark",
    onDidChangeTheme: () => ({ dispose() {} }),
    ...testDiffPreferences(),
    ready() {},
    ...overrides,
  };
}

export function testReviewSession(
  config: Partial<ReviewRuntimeConfig> = {},
  bridge: Partial<Omit<ReviewCanvasBridge, "config">> = {},
): ReviewSession {
  return {
    ...createReviewSession(testReviewBridge(config, bridge), {
      jsonReview: {
        id: config.reviewId ?? "test-review",
        version: () => undefined,
      },
    }),
    review: {
      pins: { base: "a".repeat(40), head: "b".repeat(40) },
      historicalRevision: null,
      updatedAtMs: Date.now(),

      dismiss: async () => {},
    },
  };
}

/** Document data for `blocks` alone, with empty resource maps. */
export function testApiDocumentData(blocks: Block[]): ApiDocumentData {
  return {
    snapshot: {
      reviewId: "11111111-1111-4111-8111-111111111111",
      version: 1,
      title: "Imported",
      pins: { repositoryId: "repo", base: "base", head: "head" },
      target: {
        kind: "commits",
        repositoryId: "repo",
        base: "base",
        head: "head",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      document: blocks,
    },
    headings: apiHeadingIds(blocks),
    commits: [],
    anchors: new Map(),
    images: new Map(),

    maps: new Map(),
  };
}

// Test files that are plain .ts cannot write JSX, and passing `children`
// through createElement's props trips react/no-children-prop.
export function reviewSessionElement(
  session: ReviewSession,
  children: ReactNode,
) {
  return (
    <ReviewSessionProvider session={session}>{children}</ReviewSessionProvider>
  );
}
