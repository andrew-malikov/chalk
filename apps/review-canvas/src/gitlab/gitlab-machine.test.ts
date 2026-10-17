import type { GitLabState } from "@chalk/review-contracts";
import { expect, it, vi } from "vitest";
import { createActor, waitFor } from "xstate";

import { type GitLabRequest, createGitLabMachine } from "./gitlab-machine";

const id = crypto.randomUUID();

const state: GitLabState = {
  identity: {
    host: "gitlab.test",
    url: "https://gitlab.test/a/b/-/merge_requests/1",
    projectId: 1,
    projectPath: "a/b",
    iid: 1,
    cloneUrl: "https://gitlab.test/a/b.git",
  },
  account: { id: 7, username: "andrew", name: "Andrew" },
  refs: {
    baseSha: "a".repeat(40),
    startSha: "a".repeat(40),
    headSha: "b".repeat(40),
  },
  discussions: [],
  drafts: [],
};

/** Saves wait until the test releases them, so edits can land mid-save. */
function gitlab() {
  const saves: { text: string; release(): void }[] = [];
  const posted: string[] = [];
  let failSave = false;
  let version = 0;

  const request: GitLabRequest = async (endpoint, body) => {
    const input = body as { id: string; text: string; target: unknown };

    if (endpoint === "/gitlab/drafts") {
      const { promise, resolve } = Promise.withResolvers<void>();
      saves.push({ text: input.text, release: resolve });
      await promise;

      if (failSave) throw new Error("Disk unavailable");

      return { ...input, status: "saved", version: ++version };
    }

    if (endpoint === "/gitlab/post") posted.push(saves.at(-1)!.text);

    return state;
  };

  const actor = createActor(createGitLabMachine(request)).start();
  actor.send({ type: "load", editable: true });

  return {
    actor,
    saves,
    posted,
    failSaves: () => (failSave = true),
    settle: () => waitFor(actor, (s) => s.matches("idle")),
  };
}

it("saves an edit typed during a save without marking it saved early", async () => {
  vi.useFakeTimers();
  const { actor, saves, settle } = gitlab();
  await settle();

  actor.send({ type: "compose", id, target: { kind: "general" } });
  actor.send({ type: "edit", id, text: "first" });
  await vi.advanceTimersByTimeAsync(400);
  actor.send({ type: "edit", id, text: "first and more" });
  saves[0]!.release();
  await vi.waitFor(() => expect(saves).toHaveLength(2));

  expect(actor.getSnapshot().context.editors[id]).toMatchObject({
    text: "first and more",
    dirty: true,
  });
  saves[1]!.release();
  await settle();
  expect(saves.map((s) => s.text)).toEqual(["first", "first and more"]);
  expect(actor.getSnapshot().context.editors[id]).toMatchObject({
    text: "first and more",
    dirty: false,
    version: 2,
  });
  vi.useRealTimers();
});

it("posts only after the latest text is saved", async () => {
  const { actor, saves, posted, settle } = gitlab();
  await settle();

  actor.send({ type: "compose", id, target: { kind: "general" } });
  actor.send({ type: "edit", id, text: "Ship it" });
  actor.send({ type: "run", action: "post", input: { id } });

  expect(actor.getSnapshot().context.pending?.action).toBe("post");
  actor.send({ type: "edit", id, text: "ignored while posting" });
  saves[0]!.release();
  await settle();

  expect(posted).toEqual(["Ship it"]);
  expect(actor.getSnapshot().context.pending).toBeNull();
});

it("keeps the text and reports the failure when a save before posting fails", async () => {
  const { actor, saves, posted, failSaves, settle } = gitlab();
  await settle();

  actor.send({ type: "compose", id, target: { kind: "general" } });
  actor.send({ type: "edit", id, text: "Keep me" });
  actor.send({ type: "run", action: "post", input: { id } });
  failSaves();
  saves[0]!.release();
  await settle();

  expect(posted).toEqual([]);
  expect(actor.getSnapshot().context).toMatchObject({
    error: "Disk unavailable",
    pending: null,
    editors: {
      [id]: { text: "Keep me", dirty: true, error: "Disk unavailable" },
    },
  });
});
