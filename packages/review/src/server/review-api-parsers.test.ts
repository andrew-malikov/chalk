import { describe, expect, it } from "vitest";

import { parseReviewTabTelemetryInput } from "./review-api-parsers";

describe("parseReviewTabTelemetryInput", () => {
  it("accepts the fixed tab dwell telemetry shape", () => {
    expect(
      parseReviewTabTelemetryInput({
        tab: "review",
        duration_ms: 250,
        reason: "visibility_hidden",
        app_session_id: "session-1234567890",
        document: "/pr/123",
      }),
    ).toEqual({
      tab: "review",
      durationMs: 250,
      reason: "visibility_hidden",
      appSessionId: "session-1234567890",
    });
  });

  it("rejects values outside the telemetry allowlist", () => {
    expect(() =>
      parseReviewTabTelemetryInput({
        tab: "timeline",
        duration_ms: 249,
        reason: "route_change",
        app_session_id: "../review",
      }),
    ).toThrow("tab must be review, commits, map, files");
  });
});
