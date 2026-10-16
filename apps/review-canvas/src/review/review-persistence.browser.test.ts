import { TEST_REVIEW_CONFIG } from "@canvas/test/review-session-test-utils";
import { beforeEach, expect, it, vi } from "vitest";
import { assign, createActor, setup } from "xstate";
import { z } from "zod";

import { reviewFindMachine } from "./review-find-machine";
import { reviewPersistence } from "./review-persistence";
import { type ReviewUiScope, reviewUiStateKey } from "./review-ui-state";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

const savedSchema = z.object({ selected: z.string() });

interface State {
  selected: string;
  busy: boolean;
}

function selectionPersistence(
  key = "selection",
  scope: ReviewUiScope = "session",
) {
  return reviewPersistence<State, { selected: string }>({
    key,
    scope,
    legacy: true,
    partialize: ({ selected }) => ({ selected }),
    parse: (value) => savedSchema.safeParse(value).data,
  });
}

function createSelection(key = "selection", scope: ReviewUiScope = "session") {
  const saved = selectionPersistence(key, scope);

  return createActor(
    setup({
      types: {
        context: {} as State,
        events: {} as
          | { type: "select"; selected: string }
          | { type: "setBusy"; busy: boolean },
      },
    }).createMachine({
      context: () => saved.read({ selected: "default", busy: false }),
      on: {
        select: {
          actions: [
            assign({ selected: ({ event }) => event.selected }),
            ({ context }) => saved.write(context),
          ],
        },
        setBusy: {
          actions: [
            assign({ busy: ({ event }) => event.busy }),
            ({ context }) => saved.write(context),
          ],
        },
      },
    }),
  ).start();
}

it("hydrates deliberate selections synchronously without restoring transient state", () => {
  const first = createSelection();
  expect(localStorage.getItem("selection")).toBeNull();
  first.send({ type: "select", selected: "file.ts" });
  first.send({ type: "setBusy", busy: true });

  const restored = createSelection();
  expect(restored.getSnapshot().context.selected).toBe("file.ts");
  expect(restored.getSnapshot().context.busy).toBe(false);
  restored.send({ type: "select", selected: "other.ts" });
  expect(createSelection().getSnapshot().context.selected).toBe("other.ts");
});

it("does not write unchanged persisted fields on transient updates", () => {
  const store = createSelection();
  store.send({ type: "select", selected: "file.ts" });
  const write = vi.spyOn(Storage.prototype, "setItem");

  try {
    store.send({ type: "setBusy", busy: true });
    store.send({ type: "setBusy", busy: false });
    expect(write).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});

it("migrates legacy JSON and ignores malformed and future records", () => {
  localStorage.setItem("selection", JSON.stringify({ selected: "old.ts" }));
  expect(createSelection().getSnapshot().context.selected).toBe("old.ts");
  expect(JSON.parse(localStorage.getItem("selection")!)).toEqual({
    state: { selected: "old.ts" },
    version: 1,
  });

  for (const raw of [
    "{",
    JSON.stringify({ state: { selected: 42 }, version: 1 }),
    JSON.stringify({ state: { selected: "future.ts" }, version: 2 }),
    JSON.stringify({ state: { selected: "invalid.ts" }, version: "1" }),
  ]) {
    localStorage.setItem("selection", raw);
    expect(createSelection().getSnapshot().context.selected).toBe("default");
    expect(localStorage.getItem("selection")).toBe(raw);
  }
});

it("keeps window state temporary and review state durable and isolated", () => {
  createSelection("review-a").send({ type: "select", selected: "a.ts" });
  createSelection("review-b").send({ type: "select", selected: "b.ts" });
  createSelection("temporary", "window").send({
    type: "select",
    selected: "temp.ts",
  });
  sessionStorage.clear();

  expect(createSelection("review-a").getSnapshot().context.selected).toBe(
    "a.ts",
  );
  expect(createSelection("review-b").getSnapshot().context.selected).toBe(
    "b.ts",
  );
  expect(
    createSelection("temporary", "window").getSnapshot().context.selected,
  ).toBe("default");
  const first = createSelection("review-a");
  selectionPersistence("review-a").clear();
  expect(createSelection("review-a").getSnapshot().context.selected).toBe(
    "default",
  );
  first.send({ type: "select", selected: "a.ts" });
  expect(createSelection("review-a").getSnapshot().context.selected).toBe(
    "a.ts",
  );
});

it("keeps actions usable when storage is unavailable or full", () => {
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });

  let store: ReturnType<typeof createSelection>;

  try {
    store = createSelection();
    store.send({ type: "select", selected: "in-memory.ts" });
    expect(store.getSnapshot().context.selected).toBe("in-memory.ts");
  } finally {
    read.mockRestore();
  }

  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("quota");
    });

  try {
    store.send({ type: "select", selected: "still-usable.ts" });
    expect(store.getSnapshot().context.selected).toBe("still-usable.ts");
  } finally {
    write.mockRestore();
  }
});

it("restores find inputs per review, leaving matches and handles transient", () => {
  const first = createActor(reviewFindMachine, {
    input: TEST_REVIEW_CONFIG,
  }).start();

  first.send({ type: "show", seed: "Alpha" });
  first.send({ type: "toggleOption", option: "matchCase" });
  first.send({ type: "startSearch" });

  const raw = localStorage.getItem(
    reviewUiStateKey(TEST_REVIEW_CONFIG, "session", "find"),
  )!;

  expect(JSON.parse(raw).state).toEqual({
    text: "Alpha",
    matchCase: true,
    wholeWord: false,
    isRegex: false,
  });

  const restored = createActor(reviewFindMachine, {
    input: TEST_REVIEW_CONFIG,
  }).start();

  expect(restored.getSnapshot().matches("closed")).toBe(true);
  expect(restored.getSnapshot().context.query).toEqual(
    first.getSnapshot().context.query,
  );
  expect(restored.getSnapshot().context).toMatchObject({
    matches: [],
    activeIndex: -1,
  });
  expect(
    createActor(reviewFindMachine, { input: { reviewId: "another-review" } })
      .start()
      .getSnapshot().context.query.text,
  ).toBe("");
});
