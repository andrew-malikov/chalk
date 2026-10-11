import { type JsonValue, parseZod } from "@dev.fast/review-protocol";
import type { ReviewTabTelemetryEvent } from "@review/telemetry/telemetry";
import { REVIEW_TELEMETRY_TABS } from "@review/telemetry/ui-telemetry-events";
import { z } from "zod";

import { HttpJsonError } from "./http-json";

const MIN_REVIEW_TAB_DWELL_MS = 250;

const MAX_REVIEW_TAB_DWELL_MS = 4 * 60 * 60 * 1_000;

const APP_SESSION_ID_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{15,127}$/;

export const ReviewTabTelemetryInputSchema = z
  .strictObject({
    tab: z.enum(REVIEW_TELEMETRY_TABS, {
      error: "must be review, commits, map, files",
    }),
    reason: z.enum(["tab_change", "visibility_hidden", "pagehide", "unmount"], {
      error: "must be tab_change, visibility_hidden, pagehide, or unmount",
    }),
    duration_ms: z
      .number()
      .int("must be an integer from 250ms to 4h")
      .min(MIN_REVIEW_TAB_DWELL_MS, "must be an integer from 250ms to 4h")
      .max(MAX_REVIEW_TAB_DWELL_MS, "must be an integer from 250ms to 4h"),
    app_session_id: z
      .string()
      .regex(APP_SESSION_ID_PATTERN, "must be a valid session id"),
    document: z.unknown().optional(),
  })
  .transform((event) => ({
    tab: event.tab,
    reason: event.reason,
    durationMs: event.duration_ms,
    appSessionId: event.app_session_id,
  }));

export function requestJsonErrorStatus(cause: unknown): number {
  return cause instanceof HttpJsonError ? cause.statusCode : 400;
}

export function parseReviewTabTelemetryInput(
  value: JsonValue,
): ReviewTabTelemetryEvent {
  return parseZod(
    ReviewTabTelemetryInputSchema,
    value,
    "Review tab telemetry event",
  );
}
