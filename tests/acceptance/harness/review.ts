import { mountReviewCanvas } from "@canvas/desktop-entry";
import { fixtureReviewBridge } from "@canvas/test/fixture-review-bridge";
import {
  type ReviewCanvasHandle,
  parseJsonText,
} from "@chalk/review-contracts";
import { z } from "zod";

export interface ReviewHarness {
  open(version: number, includeCommit: boolean): void;
  close(): void;
  errors: string[];
  activeStreams: number;
}

declare global {
  interface Window {
    reviewHarness: ReviewHarness;
  }
}

const reviewId = "11111111-1111-4111-8111-111111111111";

const base = "b".repeat(40);

const head = "a".repeat(40);

const subscriptionsSchema = z.array(
  z.object({ reviewId: z.literal(reviewId) }),
);

let mounted: ReviewCanvasHandle | undefined;

const harness: ReviewHarness = {
  errors: [],
  activeStreams: 0,
  close() {
    mounted?.dispose();
    mounted = undefined;
  },
  open(version, includeCommit) {
    harness.close();

    const snapshot = {
      reviewId,
      version,
      title: "Acceptance review",
      createdAt: "2026-10-14T00:00:00Z",
      pins: { repositoryId: "sample", base, head },
      document: [
        { id: "intro", type: "markdown" as const, markdown: "Review overview" },
      ],
    };

    const bridge = fixtureReviewBridge({
      snapshot,
      commits: includeCommit
        ? [
            {
              commit: head,
              parentCommit: base,
              subject: "Add the API",
              author: "Developer",
              authoredAt: "2026-10-14T00:00:00Z",
              fileCount: 1,
              additions: 1,
              deletions: 0,
            },
          ]
        : [],
      progress: {
        files: [],
        lenses: [
          {
            id: "api",
            title: "API changes",
            sources: [{ file: "api.ts", side: "head", fromLine: 1, toLine: 2 }],
            fileCount: 1,
          },
        ],
        resolvedSelections: {},
      },
    });

    const request = bridge.request;
    bridge.request = async (url, init) => {
      try {
        const parsed = new URL(String(url));

        if (parsed.pathname === "/reviews-api/watch") {
          const subscriptions = subscriptionsSchema.parse(
            parseJsonText(parsed.searchParams.get("subscriptions") ?? "[]"),
          );

          init?.signal?.throwIfAborted();
          let ended = false;
          let controller: ReadableStreamDefaultController<Uint8Array>;

          const end = () => {
            if (ended) return;
            ended = true;
            harness.activeStreams--;
            init?.signal?.removeEventListener("abort", abort);
          };

          const abort = () => {
            controller.close();
            end();
          };

          const stream = new ReadableStream<Uint8Array>({
            start(next) {
              controller = next;
              harness.activeStreams++;
              next.enqueue(
                new TextEncoder().encode(
                  JSON.stringify(
                    subscriptions.map(() => ({
                      value: { ...snapshot, activity: "unknown" },
                    })),
                  ) + "\n",
                ),
              );
              init?.signal?.addEventListener("abort", abort, { once: true });
            },
            cancel: end,
          });

          return new Response(stream, {
            headers: { "content-type": "application/x-ndjson" },
          });
        }

        const response = await request(url, init);

        if (!response.ok)
          throw new Error(
            `Unhandled fixture request: ${url} (${response.status})`,
          );

        return response;
      } catch (error) {
        if (!init?.signal?.aborted) harness.errors.push(String(error));
        throw error;
      }
    };

    mounted = mountReviewCanvas(document.getElementById("review")!, {
      kind: "api",
      reviewId,
      version,
      bridge,
    });
  },
};

const css = document.createElement("link");

css.rel = "stylesheet";

css.href = `/virtual:stylex.css?t=${performance.now()}`;

css.onload = () => {
  window.reviewHarness = harness;
};

css.onerror = () => {
  throw new Error("Cannot load canvas styles");
};

document.head.append(css);
