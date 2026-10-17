import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { CommentStorage } from "./comment-storage.js";

it("durably saves revisions and protects in-flight, uncertain and confirmed sends across hosts", () => {
  const root = mkdtempSync(path.join(tmpdir(), "comment-storage-"));
  const file = path.join(root, "state.sqlite");
  const db = new Database(file);
  db.exec(
    'CREATE TABLE reviews(id TEXT PRIMARY KEY); INSERT INTO reviews VALUES ("review")',
  );
  let state = new CommentStorage(db);
  const id = randomUUID();

  const comment = state.save("review", {
    id,
    text: "Keep this reply",
    target: { kind: "reply", discussionId: "thread" },
  });

  db.close();
  const reopened = new Database(file);
  state = new CommentStorage(reopened);
  const otherDb = new Database(file);
  const other = new CommentStorage(otherDb);

  try {
    expect(state.read("review")[0]?.text).toBe("Keep this reply");
    expect(() =>
      state.save("review", { ...comment, text: "stale", version: 0 }),
    ).toThrow(/changed/);
    const sending = state.beginPost("review", id);
    expect(sending?.status).toBe("sending");
    expect(other.beginPost("review", id)).toBeUndefined();
    expect(() =>
      other.save("review", { ...comment, text: "overwrite" }),
    ).toThrow(/sending/);
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
    expect(state.read("review")[0]?.noteId).toBe(42);
  } finally {
    otherDb.close();
    reopened.close();
    rmSync(root, { recursive: true, force: true });
  }
});
