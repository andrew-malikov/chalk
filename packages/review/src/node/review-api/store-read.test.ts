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
  store = openStore();

  oldId = await savedReview("Healthy");
  healthyId = await savedReview("Healthy");
});

afterEach(async () => {
  await store.close();
  rmSync(directory, { recursive: true, force: true });
});

it("lists a review that no longer parses as incompatible, skips it when refreshing, and still deletes it", async () => {
  await store.close();

  const db = new Database(path.join(directory, "reviews.db"));

  const row = db
    .query<{ snapshot: string }, [string]>(
      "SELECT snapshot FROM versions WHERE review_id=?",
    )
    .get(oldId)!;

  const snapshot = JSON.parse(row.snapshot);
  snapshot.document = [{ type: "retired_block", id: "block-1" }];
  db.query("UPDATE versions SET snapshot=? WHERE review_id=?").run(
    JSON.stringify(snapshot),
    oldId,
  );
  db.close();
  store = openStore();

  expect(
    store.list().map((review) => [review.reviewId, review.incompatible]),
  ).toEqual([
    [oldId, true],
    [healthyId, undefined],
  ]);
  expect(validateResource).not.toHaveBeenCalled();
  await expect(store.refreshWorktrees()).resolves.toBeUndefined();

  await store.execute({
    commandId: randomUUID(),
    operation: { type: "delete", reviewId: oldId },
  });
  expect(store.list().map((review) => review.reviewId)).toEqual([healthyId]);
});

function openStore() {
  return new ReviewStore(path.join(directory, "reviews.db"), {
    validatePins: async () => {},
    validateSource: async () => {},
    validateResource,
    // Present so refreshWorktrees walks the catalog, as it does on every server GET.
    resolveTarget: async (target) => ({ target, pins }),
  });
}

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
