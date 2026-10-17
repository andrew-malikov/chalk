import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it, vi } from "vitest";

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

it("keeps a draft's creation time across saves and reads legacy drafts without timestamps", () => {
  const db = new Database(":memory:");
  db.exec(
    'CREATE TABLE reviews(id TEXT PRIMARY KEY); INSERT INTO reviews VALUES ("review")',
  );
  const storage = new CommentStorage(db);
  vi.useFakeTimers();

  try {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));

    const draft = storage.save("review", {
      id: randomUUID(),
      text: "First draft",
      target: { kind: "general" },
    });

    expect(draft.createdAt).toBe("2026-10-10T10:00:00.000Z");
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    storage.save("review", { ...draft, text: "Edited draft" });
    expect(storage.read("review")[0]?.createdAt).toBe(draft.createdAt);
    const legacy = { ...draft, id: randomUUID(), createdAt: undefined };
    storage.update("review", (comments) => comments.push(legacy));
    expect(storage.read("review")[1]?.text).toBe("First draft");
    storage.save("review", { ...legacy, text: "Edited legacy draft" });
    expect(storage.read("review")[1]?.createdAt).toBeUndefined();
  } finally {
    vi.useRealTimers();
    db.close();
  }
});
