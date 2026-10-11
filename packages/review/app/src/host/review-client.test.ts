import type { ReviewRuntimeConfig } from "@dev.fast/review-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonReviewApiUrl, reviewFetchUrl } from "./review-client";

const injectedConfig = {
  serverUrl: "http://127.0.0.1:5570",
  reviewId: "desktop-session",
  token: "secret-token",
  wasmUrl: "vscode-file://review/libavoid.wasm",
  appVersion: "0.0.13",
  theme: "dark",
  host: "desktop",
} satisfies ReviewRuntimeConfig;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("review host client", () => {
  it("adds the desktop bearer token to API requests", async () => {
    let requestInit: RequestInit | undefined;

    const fetchMock: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response> = async (_input, init) => {
      requestInit = init;

      return new Response(null, { status: 204 });
    };

    vi.stubGlobal("fetch", fetchMock);

    await reviewFetchUrl(
      injectedConfig,
      jsonReviewApiUrl(injectedConfig, "review", "/diff"),
    );

    expect(new Headers(requestInit?.headers).get("x-review-token")).toBe(
      "secret-token",
    );
  });
});

it("routes versioned diffs without legacy document parameters", () => {
  const diff = new URL(
    jsonReviewApiUrl(injectedConfig, "review/id", "/diff", {
      version: 0,
    }),
  );

  expect(diff.pathname).toBe("/reviews-api/review%2Fid/diff");
  expect([...diff.searchParams]).toEqual([["version", "0"]]);
});
