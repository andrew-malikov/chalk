import type { ReviewCommitSummary } from "@chalk/review-contracts";
import type { AnchorRef } from "@review/documents/authoring";
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";

import {
  type ReviewNavigationRestore,
  createReviewPanelMachine,
} from "./review-panel-machine";
import type { ReviewPeekContent } from "./review-panel-model";

function createReviewPanelActor(restore?: ReviewNavigationRestore) {
  return createActor(createReviewPanelMachine(restore)).start();
}

const anchor = {
  id: "startup",
  title: "Startup",
} as AnchorRef;

const content: ReviewPeekContent = {
  kind: "inline-code",
  text: "start();",
};

const commit = {
  commit: "abc123",
  subject: "Add startup",
  fileCount: 2,
} as ReviewCommitSummary;

describe("Review navigation", () => {
  it("ignores consumption of an older map focus request", () => {
    const actor = createReviewPanelActor();
    actor.send({ type: "focusMapElement", elementPath: "review.first" });
    const firstRequest = actor.getSnapshot().context.mapFocus!.requestId;
    actor.send({ type: "focusMapElement", elementPath: "review.second" });

    actor.send({ type: "consumeMapFocus", requestId: firstRequest });
    expect(actor.getSnapshot().context.mapFocus).toMatchObject({
      elementPath: "review.second",
      pending: true,
    });
  });

  it.each(["commits", "diff", "map"] as const)(
    "falls back from an unavailable %s without closing a peek or tour",
    (view) => {
      const actor = createReviewPanelActor({ availableViews: ["review"] });
      actor.send({
        type: "openPeek",
        panel: { kind: "peek", anchor, content },
      });
      actor.send({
        type: "openOverlayTour",
        tour: { tourId: "flow", kind: "sequence" },
        anchor: "first",
      });

      actor.send({ type: "showView", view });
      expect(actor.getSnapshot()).toMatchObject({
        value: "review",
        context: {
          active: { kind: "peek" },
          overlayTour: { tourId: "flow", anchor: "first" },
        },
      });
    },
  );

  it("scopes a commit diff until the reader leaves the diff", () => {
    const actor = createReviewPanelActor();
    actor.send({ type: "openPeek", panel: { kind: "peek", anchor, content } });

    actor.send({
      type: "openCommitDiff",
      scope: { commit, file: "src/start.ts" },
    });
    expect(actor.getSnapshot()).toMatchObject({
      value: "diff",
      context: {
        diffScope: { commit, file: "src/start.ts" },
        active: null,
      },
    });

    actor.send({ type: "showView", view: "commits" });
    actor.send({ type: "showView", view: "diff" });
    expect(actor.getSnapshot().context.diffScope).toBeNull();
  });

  it("keeps a peek open beside a diff a lens opened", () => {
    const actor = createReviewPanelActor();
    actor.send({ type: "openCommitDiff", scope: { commit } });
    actor.send({ type: "showView", view: "review" });
    actor.send({ type: "openPeek", panel: { kind: "peek", anchor, content } });

    const lens = { id: "api", version: 3, mode: "structural" } as const;
    actor.send({ type: "selectLens", lens });
    expect(actor.getSnapshot()).toMatchObject({
      value: "diff",
      context: {
        diffScope: null,
        lens,
        active: { kind: "peek" },
      },
    });
  });

  it("resumes on the chalk when the stored view is not offered", () => {
    const actor = createReviewPanelActor({
      view: "map",
      availableViews: ["review", "commits", "diff"],
    });

    expect(actor.getSnapshot().value).toBe("review");
  });

  it("returns to the chalk when the current view stops being offered", () => {
    const actor = createReviewPanelActor();
    actor.send({ type: "openCommitDiff", scope: { commit } });

    actor.send({ type: "setAvailableViews", views: ["review", "map"] });
    expect(actor.getSnapshot()).toMatchObject({
      value: "review",
      context: { diffScope: null },
    });
  });

  it("opens the map on a focused element once", () => {
    const actor = createReviewPanelActor();
    actor.send({ type: "openPeek", panel: { kind: "peek", anchor, content } });

    actor.send({ type: "focusMapElement", elementPath: "review.app" });
    const focus = actor.getSnapshot().context.mapFocus!;
    expect(actor.getSnapshot()).toMatchObject({
      value: "map",
      context: {
        active: null,
        mapFocus: { elementPath: "review.app", pending: true },
      },
    });

    actor.send({ type: "consumeMapFocus", requestId: focus.requestId });
    actor.send({ type: "showView", view: "review" });
    actor.send({ type: "showView", view: "map" });
    // The map remounts here; the old request must not select its node again,
    // but the model choice still follows the focused element.
    expect(actor.getSnapshot().context.mapFocus).toMatchObject({
      elementPath: "review.app",
      pending: false,
    });
  });

  it("drops a map focus the map never applied once the reader leaves Map", () => {
    const actor = createReviewPanelActor();

    actor.send({ type: "focusMapElement", elementPath: "review.missing" });
    actor.send({ type: "showView", view: "review" });
    actor.send({ type: "showView", view: "map" });
    expect(actor.getSnapshot().context.mapFocus).toMatchObject({
      elementPath: "review.missing",
      pending: false,
    });
  });

  it("ignores a map focus on a canvas without a map", () => {
    const actor = createReviewPanelActor({ availableViews: ["review"] });

    actor.send({ type: "focusMapElement", elementPath: "review.app" });
    expect(actor.getSnapshot()).toMatchObject({
      value: "review",
      context: { mapFocus: null },
    });
  });
});

describe("Fullscreen tours", () => {
  const sequence = { tourId: "flow", kind: "sequence" } as const;

  it("reveals each explicit step and closes when the reader leaves the chalk", () => {
    const actor = createReviewPanelActor();

    actor.send({ type: "openOverlayTour", tour: sequence, anchor: "first" });
    actor.send({
      type: "moveOverlayTour",
      anchor: "second",
      reveal: false,
    });
    actor.send({
      type: "moveOverlayTour",
      anchor: "third",
      reveal: true,
    });
    expect(actor.getSnapshot().context.overlayTour).toEqual({
      ...sequence,
      anchor: "third",
      revealRequest: 2,
    });

    actor.send({ type: "showView", view: "diff" });
    expect(actor.getSnapshot().context.overlayTour).toBeNull();
  });

  it("closes when a lens moves the view to its diff", () => {
    const actor = createReviewPanelActor();

    actor.send({ type: "openOverlayTour", tour: sequence, anchor: "first" });
    actor.send({
      type: "selectLens",
      lens: { id: "api", version: 3, mode: "structural" },
    });
    expect(actor.getSnapshot()).toMatchObject({
      value: "diff",
      context: { overlayTour: null },
    });
  });

  it("reveals the first stop when an open tour switches to another tour", () => {
    const actor = createReviewPanelActor();

    const lens = (useCase: string) =>
      ({ tourId: `orders:${useCase}`, kind: "database" }) as const;

    actor.send({
      type: "openOverlayTour",
      tour: lens("create"),
      anchor: "insert",
    });
    const shown = actor.getSnapshot().context.overlayTour!.revealRequest;

    actor.send({
      type: "openOverlayTour",
      tour: lens("cancel"),
      anchor: "update",
    });
    expect(actor.getSnapshot().context.overlayTour).toMatchObject({
      tourId: "orders:cancel",
      anchor: "update",
    });
    // The panel stays mounted across the switch, so only a new request
    // scrolls it to the new tour's stop.
    expect(
      actor.getSnapshot().context.overlayTour!.revealRequest,
    ).toBeGreaterThan(shown);
  });

  it("does not resume a tour over another view", () => {
    const actor = createReviewPanelActor({
      view: "diff",
      overlayTour: { tourId: "flow", anchor: "first", revealRequest: 0 },
    });

    expect(actor.getSnapshot().context.overlayTour).toBeNull();
  });
});
