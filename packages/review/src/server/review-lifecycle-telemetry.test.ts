import { describe, expect, it } from "vitest";

import { reviewLifecycleTelemetry } from "./review-lifecycle-telemetry";

function harness() {
  const events: Array<[string, object | undefined, object | undefined]> = [];

  const hooks = reviewLifecycleTelemetry({
    captureEvent: async (event, properties, context) => {
      events.push([event, properties, context]);
    },
  });

  return { events, hooks };
}

describe("reviewLifecycleTelemetry", () => {
  it("reports each created review once, with its origin", () => {
    const { events, hooks } = harness();

    const created = {
      reviewId: "r1",
      kind: "review" as const,
      blocks: 0,
      via: "mcp" as const,
      agentKind: "claude" as const,
    };

    hooks.onReviewCreated?.(created);
    hooks.onReviewCreated?.(created);
    hooks.onReviewCreated?.({
      ...created,
      reviewId: "r2",
      via: "other",
      agentKind: undefined,
    });

    expect(events).toEqual([
      [
        "review_review_created",
        { kind: "review", blocks: 0, via: "mcp", agent_kind: "claude" },
        { reviewUuid: "r1" },
      ],
      [
        "review_review_created",
        { kind: "review", blocks: 0, via: "other" },
        { reviewUuid: "r2" },
      ],
    ]);
  });
});
