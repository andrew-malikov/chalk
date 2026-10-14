import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { ReviewStore } from "./store.js";

let directory: string, store: ReviewStore;

const providers = {
  validatePins: async () => {},
  validateSource: async () => {},
  validateResource: async () => {},
};

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "review-repository-groups-"));
  store = new ReviewStore(path.join(directory, "reviews.db"), providers);
});

afterEach(async () => {
  await store.close();
  rmSync(directory, { recursive: true, force: true });
});

it("lists linked worktrees under one repository without changing source pins", async () => {
  const main = path.join(directory, "main");
  const linked = path.join(directory, "linked");

  const git = (...args: string[]) =>
    execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  git("init", main);
  git(
    "-C",
    main,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--allow-empty",
    "-m",
    "initial",
  );
  git("-C", main, "worktree", "add", "-b", "linked", linked);

  const mainRepo = store.registerRepository(main);
  const linkedRepo = store.registerRepository(linked);

  expect(mainRepo.id).not.toBe(linkedRepo.id);

  for (const [index, repository] of [mainRepo, linkedRepo].entries())
    await store.execute({
      commandId: randomUUID(),
      operation: {
        type: "create",
        title: `Review ${index}`,
        pins: { repositoryId: repository.id, base: "base", head: "head" },
      },
    });

  const first = store.list();

  expect(first[0]?.repositoryGroup).toBeDefined();
  expect(first[0]?.repositoryGroup).toEqual(first[1]?.repositoryGroup);
  expect(new Set(first.map((review) => review.pins?.repositoryId)).size).toBe(
    2,
  );

  git(
    "-C",
    main,
    "remote",
    "add",
    "origin",
    "git@github.com:devdotfast/review.git",
  );

  // Reopening the catalog picks up the shared remote.
  await store.close();
  store = new ReviewStore(path.join(directory, "reviews.db"), providers);

  expect(store.list().map((review) => review.repositoryGroup)).toEqual([
    {
      key: "remote:https://github.com/devdotfast/review.git",
      label: "devdotfast/review",
    },
    {
      key: "remote:https://github.com/devdotfast/review.git",
      label: "devdotfast/review",
    },
  ]);
});
