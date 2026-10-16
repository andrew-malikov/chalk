import { beforeEach, expect, it } from "vitest";
import { createActor } from "xstate";

import { databaseLensMachine } from "./database-lens-machine";
import { diagramNavigationMachine } from "./diagram-navigation-machine";

function createNavigation(
  key: string,
  modelKey: string | undefined,
  expandedNodeIds: Set<string>,
) {
  return createActor(diagramNavigationMachine, {
    input: { key, modelKey, expandedNodeIds },
  }).start();
}

function createLens(key: string, useCaseIds: readonly string[]) {
  return createActor(databaseLensMachine, {
    input: { key, useCaseIds },
  }).start();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

it("restores graph selection and expansion after window storage is lost", () => {
  const first = createNavigation("review-a:map", "model-a", new Set(["app"]));

  first.send({ type: "setSelectedNodeId", next: "app.api" });
  first.send({ type: "setExpandedNodeIds", next: new Set(["app", "app.api"]) });
  first.send({ type: "setExpanded", expanded: true });
  sessionStorage.clear();

  const restored = createNavigation("review-a:map", "model-a", new Set());

  expect(restored.getSnapshot().context).toMatchObject({
    selectedNodeId: "app.api",
    expandedNodeIds: new Set(["app", "app.api"]),
    expanded: true,
    restored: true,
  });
  expect(
    createNavigation("review-b:map", "model-a", new Set()).getSnapshot().context
      .selectedNodeId,
  ).toBeNull();
  expect(
    createNavigation("review-a:map", "model-b", new Set(["new"])).getSnapshot()
      .context,
  ).toMatchObject({
    selectedNodeId: null,
    expandedNodeIds: new Set(["new"]),
    restored: false,
  });
});

it("retains database use-case choices independently and falls back when removed", () => {
  const cases = ["place-order", "read-order"];
  const first = createLens("review:database", cases);
  first.send({ type: "selectUseCase", id: "read-order" });
  expect(
    createLens("review:database", cases).getSnapshot().context.activeUseCaseId,
  ).toBe("read-order");
  expect(
    createLens("review:database", ["place-order"]).getSnapshot().context
      .activeUseCaseId,
  ).toBe("place-order");

  const place = createNavigation(
    "review:database:place-order",
    "place-order",
    new Set(["orders"]),
  );

  place.send({ type: "setExpandedNodeIds", next: new Set() });

  const read = createNavigation(
    "review:database:read-order",
    "read-order",
    new Set(["orders"]),
  );

  read.send({ type: "setSelectedNodeId", next: "orders.id" });
  expect(
    createNavigation(
      "review:database:place-order",
      "place-order",
      new Set(["orders"]),
    ).getSnapshot().context.expandedNodeIds,
  ).toEqual(new Set());
  expect(
    createNavigation(
      "review:database:read-order",
      "read-order",
      new Set(),
    ).getSnapshot().context.selectedNodeId,
  ).toBe("orders.id");
});

it("reloads the correct graph when a mounted actor changes review or model", () => {
  const actor = createNavigation("review-a", "model-a", new Set(["a"]));
  actor.send({ type: "setSelectedNodeId", next: "a.child" });
  actor.send({
    type: "setExpandedNodeIds",
    next: (current) => new Set(current).add("a.child"),
  });
  actor.send({
    type: "configure",
    input: {
      key: "review-b",
      modelKey: "model-b",
      expandedNodeIds: new Set(["b"]),
    },
  });
  expect(actor.getSnapshot().context).toMatchObject({
    selectedNodeId: null,
    expandedNodeIds: new Set(["b"]),
    restored: false,
  });
  actor.send({ type: "setSelectedNodeId", next: "b.child" });
  actor.send({
    type: "configure",
    input: { key: "review-a", modelKey: "model-a", expandedNodeIds: new Set() },
  });
  expect(actor.getSnapshot().context).toMatchObject({
    selectedNodeId: "a.child",
    expandedNodeIds: new Set(["a", "a.child"]),
    restored: true,
  });
  actor.send({
    type: "configure",
    input: {
      key: "review-a",
      modelKey: "replacement",
      expandedNodeIds: new Set(["new"]),
    },
  });
  expect(actor.getSnapshot().context).toMatchObject({
    selectedNodeId: null,
    expandedNodeIds: new Set(["new"]),
    restored: false,
  });
});

it("keeps a use-case selection on equivalent inputs and resets it when removed", () => {
  const actor = createLens("database", ["place-order", "read-order"]);
  actor.send({ type: "selectUseCase", id: "read-order" });
  actor.send({
    type: "configure",
    input: { key: "database", useCaseIds: ["place-order", "read-order"] },
  });
  expect(actor.getSnapshot().context.activeUseCaseId).toBe("read-order");
  actor.send({
    type: "configure",
    input: { key: "database", useCaseIds: ["place-order"] },
  });
  expect(actor.getSnapshot().context.activeUseCaseId).toBe("place-order");
  actor.send({ type: "selectUseCase", id: "removed" });
  expect(actor.getSnapshot().context.activeUseCaseId).toBe("place-order");
  actor.send({ type: "configure", input: { key: "empty", useCaseIds: [] } });
  expect(actor.getSnapshot().context.activeUseCaseId).toBeNull();
});
