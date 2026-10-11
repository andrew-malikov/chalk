import { isJsonObject } from "@dev.fast/review-protocol";
import { ReviewInputError } from "@review/review-api/document";
import { ReviewStore } from "@review/review-api/store";
import type { ReviewTelemetry } from "@review/telemetry/telemetry";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { readBoundedRequestJson } from "./hono-http";
import {
  parseReviewTabTelemetryInput,
  requestJsonErrorStatus,
} from "./review-api-parsers";
import { captureSanitizedUiTelemetry } from "./ui-telemetry";

/** Telemetry for a pinned native review. */
export function createJsonReviewReporting(
  store: ReviewStore,
  telemetry: Pick<ReviewTelemetry, "captureUiEvent" | "captureTabViewed">,
) {
  const app = new Hono();
  app.onError((error, context) =>
    context.json(
      { ok: false, error: error.message },
      // SAFETY: ReviewInputError carries an HTTP status; JSON parser failures are 4xx.
      (error instanceof ReviewInputError
        ? error.status
        : requestJsonErrorStatus(error)) as ContentfulStatusCode,
    ),
  );
  app.use("/:id/telemetry/*", async (context, next) => {
    const id = context.req.param("id")!;

    store.assertExists(id);
    await next();
  });
  app.post("/:id/telemetry/event", async (c) => {
    const body = await readBoundedRequestJson(c.req.raw, undefined, {});
    const payload = isJsonObject(body) ? body : {};
    const rawContext = isJsonObject(payload.context) ? payload.context : {};
    await captureSanitizedUiTelemetry(
      telemetry,
      c.req.raw,
      payload.name,
      payload.properties,
      undefined,
      payload.error,
      // The path id wins: the middleware above already asserted it exists,
      // so a payload trying to assert a different review id is overridden.
      { ...rawContext, reviewUuid: c.req.param("id") },
      payload.occurredAt,
    );

    return c.json({ ok: true });
  });
  app.post("/:id/telemetry/tab", async (context) => {
    const input = await readBoundedRequestJson(
      context.req.raw,
      undefined,
      {},
      { allowTextPlain: true },
    );

    await telemetry.captureTabViewed(parseReviewTabTelemetryInput(input), {
      reviewUuid: context.req.param("id"),
    });

    return context.json({ ok: true });
  });

  return app;
}
