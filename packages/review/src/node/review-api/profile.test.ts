import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { openReviewProfile } from "./profile.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "review-profile-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

it("reopens current review history despite unreadable obsolete profile files", async () => {
  const initial = await openReviewProfile(home, { manageWorkspaces: false });
  let reviewId: string;

  try {
    const repo = path.join(home, "repo");
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
    await mkdir(repo);
    git("init", "-q");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "initial",
    );
    const head = git("rev-parse", "HEAD");
    const created = await initial.store.execute({
      commandId: randomUUID(),
      operation: {
        type: "create",
        title: "Notes",
        pins: {
          repositoryId: initial.store.registerRepository(repo).id,
          base: head,
          head,
        },
      },
    });

    reviewId = created.reviewId;
    await initial.store.execute({
      commandId: randomUUID(),
      operation: {
        type: "edit",
        reviewId,
        edit: {
          type: "insert",
          content: { type: "markdown", markdown: "Saved notes" },
        },
      },
    });
  } finally {
    await initial.data.close();
    await initial.store.close();
  }

  const obsolete = [
    "json-cutover.json",
    "reviews/11111111-1111-4111-8111-111111111111/review.json",
    "review-server/reviews.db",
    "reviews.db",
  ];

  for (const file of obsolete) {
    const target = path.join(home, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "unreadable obsolete data");
  }

  const reopened = await openReviewProfile(home, { manageWorkspaces: false });

  try {
    expect(reopened.store.read(reviewId).document).toEqual([
      { id: "block-1", type: "markdown", markdown: "Saved notes" },
    ]);
    expect(reopened.store.history(reviewId)).toHaveLength(2);
    expect(reopened.store.read(reviewId, 0).document).toEqual([]);

    for (const file of obsolete)
      expect(await readFile(path.join(home, file), "utf8")).toBe(
        "unreadable obsolete data",
      );
  } finally {
    await reopened.data.close();
    await reopened.store.close();
  }
});
