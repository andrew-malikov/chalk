import { ReviewSessionProvider } from "@canvas/host/review-session";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewProvider, useReview } from "./review-context";

const roots: Array<ReturnType<typeof createRoot>> = [];

let review: ReturnType<typeof useReview> | null = null;

function CaptureReview() {
  review = useReview();

  return null;
}

describe("ReviewProvider session facts", () => {
  beforeEach(() => {
    review = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await act(async () => {
      for (const root of roots.splice(0)) root.unmount();
    });
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the pins from the displayed native review", async () => {
    vi.stubGlobal("fetch", undefined);

    const statusSession = testReviewSession();
    statusSession.review!.pins = { base: "base-sha", head: "head-sha" };

    await renderProvider(statusSession);

    await vi.waitFor(() => {
      expect(requireReview()).toMatchObject({
        submissionOutcome: null,
        resolvedBaseRef: "base-sha",
        resolvedHeadRef: "head-sha",
      });
    });
  });

  it("updates dismissal state only after dismissal succeeds", async () => {
    const session = testReviewSession();

    session.review!.dismiss = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);

    await renderProvider(session);

    await expect(requireReview().dismissReview()).rejects.toThrow("offline");
    expect(requireReview().submissionOutcome).toBeNull();

    await act(() => requireReview().dismissReview());
    expect(requireReview().submissionOutcome).toBe("dismissed");
  });
});

async function renderProvider(
  reviewSession: ReturnType<typeof testReviewSession>,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      <ReviewSessionProvider session={reviewSession}>
        <ReviewProvider>
          <CaptureReview />
        </ReviewProvider>
      </ReviewSessionProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

function requireReview(): ReturnType<typeof useReview> {
  if (!review) throw new Error("Review context was not captured");

  return review;
}
