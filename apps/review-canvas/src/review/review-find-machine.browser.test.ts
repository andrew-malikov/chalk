import { expect, it } from "vitest";
import { createActor } from "xstate";

import { type ReviewFindMatch, reviewFindMachine } from "./review-find-machine";

function match(): ReviewFindMatch {
  return {
    kind: "mdx",
    range: document.createRange(),
    node: document.createTextNode("Alpha"),
  };
}

it("accepts only the latest search and ignores results after closing", () => {
  const actor = createActor(reviewFindMachine, { input: undefined }).start();
  actor.send({ type: "show", seed: "Alpha" });
  actor.send({ type: "startSearch" });
  const older = actor.getSnapshot().context.generation;
  actor.send({ type: "startSearch" });
  const generation = actor.getSnapshot().context.generation;
  actor.send({ type: "completeSearch", generation: older, matches: [match()] });
  expect(actor.getSnapshot().matches({ open: "searching" })).toBe(true);
  expect(actor.getSnapshot().context.matches).toEqual([]);
  const matches = [match()];
  actor.send({ type: "completeSearch", generation, matches });
  expect(actor.getSnapshot().matches({ open: "idle" })).toBe(true);
  expect(actor.getSnapshot().context.matches).toEqual(matches);
  actor.send({ type: "close" });
  actor.send({ type: "completeSearch", generation, matches });
  expect(actor.getSnapshot().matches("closed")).toBe(true);
  expect(actor.getSnapshot().context.matches).toEqual([]);
});

it("keeps the last valid matches for an invalid expression and recovers", () => {
  const actor = createActor(reviewFindMachine, { input: undefined }).start();
  actor.send({ type: "show", seed: "Alpha" });
  actor.send({ type: "startSearch" });
  const matches = [match()];
  actor.send({
    type: "completeSearch",
    generation: actor.getSnapshot().context.generation,
    matches,
  });
  actor.send({ type: "setActiveIndex", index: 0 });
  actor.send({ type: "rejectQuery", error: "Invalid expression" });
  expect(actor.getSnapshot().matches({ open: "invalid" })).toBe(true);
  expect(actor.getSnapshot().context).toMatchObject({
    matches,
    activeIndex: 0,
    error: "Invalid expression",
  });
  actor.send({ type: "startSearch" });
  expect(actor.getSnapshot().matches({ open: "searching" })).toBe(true);
  expect(actor.getSnapshot().context).toMatchObject({
    matches: [],
    activeIndex: -1,
    error: null,
  });
});

it("retains options on close and clears text only when requested", () => {
  const actor = createActor(reviewFindMachine, { input: undefined }).start();
  actor.send({ type: "show", seed: "Alpha" });
  actor.send({ type: "toggleOption", option: "matchCase" });
  actor.send({ type: "show", seed: "ignored" });
  actor.send({ type: "close" });
  actor.send({ type: "show" });
  expect(actor.getSnapshot().context.query).toMatchObject({
    text: "Alpha",
    matchCase: true,
  });
  actor.send({ type: "close", clearQuery: true });
  expect(actor.getSnapshot().context.query).toMatchObject({
    text: "",
    matchCase: true,
  });
});
