import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ReviewStore } from "./store";

let directory: string;

let store: ReviewStore;

const validateResource = vi.fn<() => Promise<void>>(async () => {});

const pins = {
  repositoryId: "repo",
  base: "a".repeat(40),
  head: "b".repeat(40),
};

let oldId: string;

let healthyId: string;

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "review-read-"));
  validateResource.mockClear();
  store = new ReviewStore(path.join(directory, "reviews.db"), {
    validatePins: async () => {},
    validateSource: async () => {},
    validateResource,
  });

  oldId = await savedReview("Healthy");
  healthyId = await savedReview("Healthy");
});

afterEach(async () => {
  await store.close();
  rmSync(directory, { recursive: true, force: true });
});

it.each([undefined, 0])(
  "rejects retired quotes when reading version %s without touching resources",
  (version) => {
    const db = new Database(path.join(directory, "reviews.db"));

    const row = db
      .query<{ snapshot: string }, [string]>(
        "SELECT snapshot FROM versions WHERE review_id=?",
      )
      .get(oldId)!;

    const snapshot = JSON.parse(row.snapshot);
    snapshot.document = [
      {
        type: "trace_quote",
        id: "block-1",
        traceId: "old",
        eventId: "event",
        text: "Old quote",
      },
    ];
    db.query("UPDATE versions SET snapshot=? WHERE review_id=?").run(
      JSON.stringify(snapshot),
      oldId,
    );
    db.close();
    expect(() => store.read(oldId, version)).toThrow(
      /agent traces.*no longer supported/i,
    );
    expect(store.read(healthyId).document[0]).toMatchObject({
      markdown: "Healthy",
    });
    expect(store.list()).toHaveLength(2);
    expect(validateResource).not.toHaveBeenCalled();
  },
);

it.each([
  "[quote](review-trace:old#event)",
  "[quote][old]\n\n[old]: review-trace:old#event",
])("rejects active retired Markdown links: %s", async (markdown) => {
  await expect(savedReview(markdown)).rejects.toThrow(
    /agent traces.*no longer supported/i,
  );
});

it("accepts retired-scheme text in code literals and ordinary quotations", async () => {
  const reviewId = await savedReview(
    "> A quotation\n\n`review-trace:old#event`\n\n```\n[quote](review-trace:old#event)\n```",
  );

  expect(store.read(reviewId).document).toHaveLength(1);
});

async function savedReview(markdown: string): Promise<string> {
  const created = await store.execute(
    {
      commandId: randomUUID(),
      operation: { type: "create", title: "Saved", pins },
    },
    { document: [{ type: "markdown", markdown }], origin: {} },
  );

  return created.reviewId;
}
