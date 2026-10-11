import { randomUUID } from "node:crypto";

import type { JsonValue } from "@dev.fast/review-protocol";
import { ReviewStore } from "@review/review-api/store";
import type { ReviewTelemetry } from "@review/telemetry/telemetry";
import { afterEach, expect, it, vi } from "vitest";

import { createJsonReviewReporting } from "./json-review-reporting";

let store: ReviewStore;

afterEach(async () => store?.close());

it("routes sanitized telemetry and tab dwell events for the requested review", async () => {
  store = new ReviewStore(":memory:", {
    validatePins: async () => {},
    validateSource: async () => {},
    validateResource: async () => {},
  });
  const repository = store.registerRepository(process.cwd());
  const reviewId = randomUUID();
  const pins = { repositoryId: repository.id, base: "base", head: "head" };
  await store.importVersion({
    reviewId,
    pins,
    title: "Original",
    document: [{ type: "markdown", markdown: "Original prose" }],
    createdAt: "2026-01-01T00:00:00Z",
  });

  const telemetry = {
    captureUiEvent: vi.fn<ReviewTelemetry["captureUiEvent"]>(),
    captureTabViewed: vi.fn<ReviewTelemetry["captureTabViewed"]>(),
  };

  const app = createJsonReviewReporting(store, telemetry);

  const post = (
    route: string,
    body: JsonValue,
    contentType = "application/json",
  ) =>
    app.request(`/${reviewId}/telemetry/${route}`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: JSON.stringify(body),
    });

  const sessionId = randomUUID();
  expect(
    (
      await post("event", {
        name: "app_opened",
        properties: { app_session_id: sessionId, secret: "drop-me" },
      })
    ).status,
  ).toBe(200);
  expect(telemetry.captureUiEvent).toHaveBeenCalledWith(
    "review_app_opened",
    { app_session_id: sessionId },
    { reviewUuid: reviewId },
    expect.any(Number),
  );
  expect(
    (
      await post("event", {
        name: "review_presented",
        properties: { load_ms: 240 },
        context: {
          presentationSessionId: "0f98956f-ec90-45b5-ae21-19acbcd8b6ef",
        },
      })
    ).status,
  ).toBe(200);
  expect(telemetry.captureUiEvent).toHaveBeenLastCalledWith(
    "review_review_presented",
    { load_ms: 240 },
    {
      reviewUuid: reviewId,
      presentationSessionId: "0f98956f-ec90-45b5-ae21-19acbcd8b6ef",
    },
    expect.any(Number),
  );
  expect(
    (
      await post(
        "tab",
        {
          tab: "review",
          reason: "pagehide",
          duration_ms: 500,
          app_session_id: sessionId,
        },
        "text/plain",
      )
    ).status,
  ).toBe(200);
  expect(telemetry.captureTabViewed).toHaveBeenCalledWith(
    {
      tab: "review",
      reason: "pagehide",
      durationMs: 500,
      appSessionId: sessionId,
    },
    { reviewUuid: expect.any(String) },
  );
});
