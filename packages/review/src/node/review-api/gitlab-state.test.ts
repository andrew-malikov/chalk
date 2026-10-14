import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { GitLabState } from "@blackboard/review-contracts";
import { expect, it } from "vitest";

import { GitLabStorage } from "./gitlab-state.js";

const initial: GitLabState = {
  identity: {
    host: "gitlab.test",
    url: "https://gitlab.test/a/b/-/merge_requests/1",
    projectId: 1,
    projectPath: "a/b",
    iid: 1,
    cloneUrl: "https://gitlab.test/a/b.git",
  },
  account: null,
  refs: {
    baseSha: "a".repeat(40),
    startSha: "a".repeat(40),
    headSha: "b".repeat(40),
  },
  discussions: [],
  drafts: [],
};

it("durably saves revisions and protects in-flight, uncertain and confirmed sends across hosts", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gitlab-state-"));
  const file = path.join(root, "state.sqlite");
  const db = new Database(file);
  db.exec(
    'CREATE TABLE reviews(id TEXT PRIMARY KEY); INSERT INTO reviews VALUES ("review")',
  );
  let state = new GitLabStorage(db);
  state.seed("review", initial);
  const id = randomUUID();

  const draft = state.save("review", {
    id,
    text: "Keep this reply",
    target: { kind: "reply", discussionId: "thread" },
  });

  db.close();
  const reopened = new Database(file);
  state = new GitLabStorage(reopened);
  const otherDb = new Database(file);
  const other = new GitLabStorage(otherDb);

  try {
    expect(state.read("review").drafts[0]?.text).toBe("Keep this reply");
    expect(() =>
      state.save("review", { ...draft, text: "stale", version: 0 }),
    ).toThrow(/changed/);
    const sending = state.beginPost("review", id);
    expect(sending?.status).toBe("sending");
    expect(other.beginPost("review", id)).toBeUndefined();
    expect(() => other.save("review", { ...draft, text: "overwrite" })).toThrow(
      /sending/,
    );
    state.finishPost("review", id, {
      status: "uncertain",
      error: "Verify on GitLab",
    });
    expect(other.beginPost("review", id)).toBeUndefined();
    state.recover("review", id, false);
    expect(other.beginPost("review", id)?.text).toBe("Keep this reply");
    state.finishPost("review", id, { status: "sent", noteId: 42 });
    expect(other.beginPost("review", id)).toBeUndefined();
    expect(() => state.discard("review", id)).toThrow(/sent/);
    expect(state.read("review").drafts[0]?.noteId).toBe(42);
  } finally {
    otherDb.close();
    reopened.close();
    rmSync(root, { recursive: true, force: true });
  }
});
