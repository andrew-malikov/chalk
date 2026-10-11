import { describe, expect, it } from "vitest";

import {
  ReviewBugReportMetaV2Schema,
  parseReviewBugReportRequest,
} from "./bug-report.js";

describe("bug report protocol", () => {
  const payloadPart = {
    field: "payload" as const,
    filename: "payload.json.gz" as const,
    bytes: 100,
    sha256: "a".repeat(64),
  };

  const baseMeta = {
    schema_version: 2,
    description_length: 12,
    has_review: false,
    has_map: false,
    has_diff: false,
    has_screenshot: false,
    has_trace: false,
    payload_bytes: 100,
    app_version: "1.2.3",
    cli_version: "0.0.1",
    platform: "darwin",
    truncated_diff: false,
    truncated_map: false,
    truncated_screenshot: false,
    truncated_trace: false,
    parts: [payloadPart],
  } as const;

  it("accepts the 64 KiB description boundary", () => {
    const description = "😀".repeat(16_384);

    const meta = {
      ...baseMeta,
      description,
      description_length: 65_536,
    };

    expect(ReviewBugReportMetaV2Schema.parse(meta)).toEqual(meta);
  });

  it("rejects an oversized description or a byte-length mismatch", () => {
    expect(() =>
      ReviewBugReportMetaV2Schema.parse({
        ...baseMeta,
        description: "😀".repeat(16_384) + "a",
        description_length: 65_536,
      }),
    ).toThrow(/65,536 UTF-8 bytes/);
    expect(() =>
      ReviewBugReportMetaV2Schema.parse({
        ...baseMeta,
        description: "Snow: 雪",
        description_length: 7,
      }),
    ).toThrow(/must match the description UTF-8 byte length/);
  });
});

it("rejects retired trace attachments", () => {
  const request = {
    description: "",
    include_review: true,
    include_map: true,
    include_diff: true,
    include_trace: true,
    app_session_id: "session-1234567890",
    app_version: "1.2.3",
  };

  expect(() => parseReviewBugReportRequest(request)).toThrow(/include_trace/);
});
