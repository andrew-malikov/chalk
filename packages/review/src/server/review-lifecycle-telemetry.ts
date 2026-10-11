import type { ReviewApiHooks } from "@review/review-api/http.js";
import type { PostHogCaptureProperties } from "@review/telemetry/posthog-capture-client";
import type { ReviewTelemetry } from "@review/telemetry/review-telemetry";

/** Reports each created review once per server process. */
export function reviewLifecycleTelemetry(
  telemetry: Pick<ReviewTelemetry, "captureEvent">,
): ReviewApiHooks {
  const reported = new Set<string>();

  const capture = (
    event: string,
    properties?: PostHogCaptureProperties,
    reviewUuid?: string,
  ) =>
    void telemetry.captureEvent(
      event,
      properties,
      reviewUuid ? { reviewUuid } : undefined,
    );

  return {
    onReviewCreated: ({ reviewId, kind, blocks, via, agentKind }) => {
      if (reported.has(reviewId)) return;
      reported.add(reviewId);

      const properties: PostHogCaptureProperties = { kind, blocks, via };

      if (agentKind) properties.agent_kind = agentKind;
      capture("review_review_created", properties, reviewId);
    },
  };
}
