export * from "@dev.fast/diffr";

export * from "./structural-diff.js";

import type { JsonValue } from "@chalk/json";
import { z } from "zod";

export {
  parseReviewCodePeekPatch,
  reviewCodePeekRowAnchorLine,
  reviewCodePeekRangeCounts,
  type ReviewCodePeekPatch,
  type ReviewCodePeekHunk,
  type ReviewCodePeekHunkRow,
  type ReviewCodePeekOrientation,
} from "./code-peek-diff.js";

import {
  type ReviewCliInstallApplyRequest,
  ReviewCliInstallApplyRequestSchema,
  type ReviewCliInstallApplyResponse,
  ReviewCliInstallApplyResponseSchema,
  type ReviewCliInstallStatus,
  ReviewCliInstallStatusSchema,
  type ReviewDesktopDiscovery,
  ReviewDesktopDiscoverySchema,
  type ReviewDesktopVerbFrame,
  ReviewDesktopVerbFrameSchema,
  type ReviewDesktopVerbResult,
  ReviewDesktopVerbResultSchema,
  type ReviewDiffFilesResponse,
  ReviewDiffFilesResponseSchema,
  type ReviewFileContentRequest,
  ReviewFileContentRequestSchema,
  type ReviewFileContentResponse,
  ReviewFileContentResponseSchema,
  type ReviewTutorialOpenResponse,
  ReviewTutorialOpenResponseSchema,
  type ReviewVerbRequest,
  ReviewVerbRequestSchema,
  type ReviewVerbResponse,
  ReviewVerbResponseSchema,
} from "./contracts.js";

export * from "@chalk/json";

export * from "./contracts.js";

export * from "./review-api-client.js";

export function parseReviewDesktopDiscovery(
  value: JsonValue,
): ReviewDesktopDiscovery {
  return parseZod(ReviewDesktopDiscoverySchema, value);
}

export function parseReviewCliInstallStatus(
  value: JsonValue,
): ReviewCliInstallStatus {
  return parseZod(ReviewCliInstallStatusSchema, value);
}

export function parseReviewCliInstallApplyRequest(
  value: JsonValue,
): ReviewCliInstallApplyRequest {
  return parseZod(ReviewCliInstallApplyRequestSchema, value);
}

export function parseReviewCliInstallApplyResponse(
  value: JsonValue,
): ReviewCliInstallApplyResponse {
  return parseZod(ReviewCliInstallApplyResponseSchema, value);
}

export function parseReviewTutorialOpenResponse(
  value: JsonValue,
): ReviewTutorialOpenResponse {
  return parseZod(ReviewTutorialOpenResponseSchema, value);
}

export function parseReviewDesktopVerbFrame(
  value: JsonValue,
): ReviewDesktopVerbFrame {
  return parseZod(ReviewDesktopVerbFrameSchema, value);
}

export function parseReviewDesktopVerbResult(
  value: JsonValue,
): ReviewDesktopVerbResult {
  return parseZod(ReviewDesktopVerbResultSchema, value);
}

export function parseReviewDiffFilesResponse(
  value: JsonValue,
): ReviewDiffFilesResponse {
  return parseZod(ReviewDiffFilesResponseSchema, value);
}

export function parseReviewFileContentResponse(
  value: JsonValue,
): ReviewFileContentResponse {
  return parseZod(ReviewFileContentResponseSchema, value);
}

export function parseReviewFileContentRequest(
  value: JsonValue,
): ReviewFileContentRequest {
  return parseZod(ReviewFileContentRequestSchema, value);
}

export function parseReviewVerbRequest(value: JsonValue): ReviewVerbRequest {
  return parseZod(ReviewVerbRequestSchema, value);
}

export function parseReviewVerbResponse(value: JsonValue): ReviewVerbResponse {
  return parseZod(ReviewVerbResponseSchema, value);
}

export function parseZod<T>(
  schema: z.ZodType<T>,
  value: JsonValue,
  label?: string,
  prefixPath = false,
): T {
  const result = schema.safeParse(value);

  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const issuePath = formatIssuePath(issue?.path ?? []);

  const path =
    prefixPath && label
      ? issuePath
        ? `${label}.${issuePath}`
        : label
      : issuePath || label;

  throw new Error(
    `${path ? `${path} ` : ""}${issue?.message ?? "Invalid input"}`,
  );
}

function formatIssuePath(path: PropertyKey[]): string {
  let output = "";

  for (const segment of path) {
    if (Number.isInteger(segment)) {
      output += `[${String(segment)}]`;
    } else {
      output += `${output ? "." : ""}${String(segment)}`;
    }
  }

  return output;
}

export { structuralRows } from "./source-alignment.js";

export * from "./review-event-stream.js";

export * from "./gitlab.js";
