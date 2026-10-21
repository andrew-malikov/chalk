import { DiffNavigationSlot, ReviewDiffView } from "@canvas/diff/DiffView";
import { ReviewSessionProvider } from "@canvas/host/review-session";
import { AuthoringActivityBadge } from "@canvas/review/authoring-activity";
import { AuthoringActivityContext } from "@canvas/review/authoring-activity-context";
import type { AuthoringCursor } from "@canvas/review/authoring-cursor";
import { ReviewLensesProvider } from "@canvas/review/review-lenses";
import { ReviewPanelProvider } from "@canvas/review/review-panel";
import {
  ReviewContainerProvider,
  type ReviewRoots,
  ReviewRootsProvider,
} from "@canvas/review/review-root-context";
import { TestCanvasQuery } from "@canvas/test/canvas-query-test-utils";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import { ReviewApiClient } from "@chalk/review-contracts";
import type { Lens } from "@review/documents/diff-lenses";
import type { ActivitySnapshot } from "@review/node/review-api/activity";
import type { Snapshot } from "@review/node/review-api/store";
import { act, createRef } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AuthoringCursorContext } from "./courier";
import { type DrawQueueClock, DrawQueueProvider } from "./draw-queue-provider";

const api: Lens = {
  id: "lens-1",
  title: "API",
  targets: [{ kind: "files", patterns: ["src/api/**"] }],
};

const docs: Lens = {
  id: "lens-2",
  title: "Docs",
  targets: [
    { kind: "files", patterns: ["docs/**"] },
    {
      kind: "ranges",
      sources: [
        {
          file: "README.md",
          start: { side: "head", line: 1 },
          end: { side: "head", line: 4 },
        },
      ],
    },
  ],
};

const lensesOnly: ActivitySnapshot = {
  workingCount: 1,
  expiresAt: null,
  scopes: ["lenses"],
};

const both: ActivitySnapshot = {
  workingCount: 2,
  expiresAt: null,
  scopes: ["document", "lenses"],
};

/** Timers the test fires by hand, so each phase is asserted on schedule. */
const createManualClock = () => {
  let time = 0;
  let scheduled: { id: number; due: number; fn: () => void } | null = null;
  let nextId = 0;

  const clock: DrawQueueClock = {
    now: () => time,
    setTimeout: (fn, ms) => {
      scheduled = { id: ++nextId, due: time + ms, fn };

      return scheduled.id;
    },
    clearTimeout: (handle) => {
      if (scheduled?.id === handle) scheduled = null;
    },
  };

  return {
    clock,
    advance: async (ms: number) => {
      time += ms;
      const due = scheduled;

      if (due && due.due <= time) {
        scheduled = null;
        await act(async () => due.fn());
      }
    },
  };
};

let app: HTMLDivElement, toggleSlot: HTMLDivElement, root: Root;

let manualClock: ReturnType<typeof createManualClock>;

const onLocate = vi.fn<(view: "review" | "diff") => void>();

/** The lenses the host's progress route answers with: the version shown. */
let served: Lens[] = [];

let uncategorizedFileCount = 1;

let uncategorizedPending = false;

const session = testReviewSession(
  {},
  {
    request: async () =>
      Response.json({
        files: [],
        lenses: [
          ...served.map((lens) => ({
            id: lens.id,
            title: lens.title,
            sources: [],
            fileCount: 1,
          })),
          {
            id: "automatic-uncategorized",
            title: "Uncategorized changes",
            sources: [],
            fileCount: uncategorizedFileCount,
            pending: uncategorizedPending,
          },
        ],
        resolvedSelections: {},
      }),
    diffView: {
      files: async () => [],
    },
  },
);

const client = new ReviewApiClient(session.config, session.bridge.request);

beforeEach(() => {
  app = document.createElement("div");
  app.style.width = "900px";
  app.style.height = "700px";
  toggleSlot = document.createElement("div");
  document.body.append(app);
  app.append(toggleSlot);
  root = createRoot(app.appendChild(document.createElement("div")));
  manualClock = createManualClock();
  onLocate.mockClear();
  uncategorizedFileCount = 1;
  uncategorizedPending = false;
});

afterEach(async () => {
  await act(async () => root.unmount());
  app.remove();
  toggleSlot.remove();
  window.localStorage.clear();
});

const render = async (state: {
  lenses: Lens[];
  version: number;
  activity?: ActivitySnapshot;
  lensCursor: AuthoringCursor | null;
  documentCursor?: AuthoringCursor | null;
}) => {
  served = state.lenses;

  const snapshot: Snapshot = {
    reviewId: "lens-courier",
    version: state.version,
    title: "Lenses",
    pins: { repositoryId: "r", base: "b", head: "h" },
    target: { kind: "commits", repositoryId: "r", base: "b", head: "h" },
    document: [],
    lenses: state.lenses,
    createdAt: "2026-09-23",
  };

  const roots: ReviewRoots = {
    appRef: { current: app },
    shellRef: createRef<HTMLElement>(),
    scrollRegionRef: createRef<HTMLElement>(),
    articleRef: createRef<HTMLElement>(),
  };

  await act(async () =>
    root.render(
      <TestCanvasQuery>
        <ReviewSessionProvider session={session}>
          <ReviewContainerProvider container={app}>
            <ReviewRootsProvider roots={roots}>
              <AuthoringActivityContext.Provider
                value={state.activity ?? lensesOnly}
              >
                <AuthoringCursorContext.Provider
                  value={state.documentCursor ?? null}
                >
                  <DrawQueueProvider
                    scope="lenses"
                    cursor={state.lensCursor}
                    clock={manualClock.clock}
                  >
                    <ReviewPanelProvider>
                      <ReviewLensesProvider client={client} snapshot={snapshot}>
                        <AuthoringActivityBadge onLocate={onLocate} />
                        <DiffNavigationSlot.Provider value={toggleSlot}>
                          <ReviewDiffView />
                        </DiffNavigationSlot.Provider>
                      </ReviewLensesProvider>
                    </ReviewPanelProvider>
                  </DrawQueueProvider>
                </AuthoringCursorContext.Provider>
              </AuthoringActivityContext.Provider>
            </ReviewRootsProvider>
          </ReviewContainerProvider>
        </ReviewSessionProvider>
      </TestCanvasQuery>,
    ),
  );
};

let seq = 0;

const lensEdit = (
  type: "insert" | "update" | "remove",
  targetId: string,
): AuthoringCursor => ({
  targetId,
  blockId: targetId,
  source: "edit",
  edit: { type, targetId, blockId: targetId, kind: "lens" },
  seq: ++seq,
});

const navigationButton = () =>
  toggleSlot.querySelector<HTMLButtonElement>(
    '[data-diff-navigation="lenses"]',
  )!;

const openNavigation = async () => {
  if (navigationButton().getAttribute("aria-expanded") === "false")
    await act(async () => navigationButton().click());
};

const row = (id: string) =>
  app.querySelector<HTMLElement>(`[data-lens-id="${id}"]`);

const courier = () =>
  app.querySelector<HTMLElement>('.courier[data-scope="lenses"]');

it.each([
  { workingCount: 0, expiresAt: null, scopes: [] },
  { workingCount: 1, expiresAt: null, scopes: ["document"] },
] satisfies ActivitySnapshot[])(
  "does not replay the courier's departure when opening an inactive lens session: %j",
  async (activity) => {
    await render({
      lenses: [api],
      version: 1,
      activity,
      lensCursor: {
        targetId: api.id,
        blockId: api.id,
        source: "focus",
        seq: 1,
      },
    });

    for (let opening = 0; opening < 2; opening++) {
      await openNavigation();
      await vi.waitFor(() => expect(row(api.id)).not.toBeNull());
      expect(courier()).toBeNull();
      await act(async () => navigationButton().click());
    }
  },
);

it.each([
  { fileCount: 0, pending: false, visible: false },
  { fileCount: 1, pending: false, visible: true },
  { fileCount: 0, pending: true, visible: true },
])(
  "shows uncategorized changes only when nonempty or pending: %j",
  async ({ fileCount, pending, visible }) => {
    uncategorizedFileCount = fileCount;
    uncategorizedPending = pending;
    await render({ lenses: [api], version: 1, lensCursor: null });
    await openNavigation();
    await vi.waitFor(() =>
      expect(
        row(api.id)?.querySelector("button[aria-pressed]")?.textContent,
      ).not.toContain("…"),
    );
    expect(!!row("automatic-uncategorized")).toBe(visible);
  },
);

it("lands a new lens row with the courier on it, without listing its files, and erases a removed one", async () => {
  await render({ lenses: [api], version: 1, lensCursor: null });
  expect(courier()).toBeNull();
  await openNavigation();

  await render({
    lenses: [api, docs],
    version: 2,
    lensCursor: lensEdit("insert", docs.id),
  });
  expect(row(docs.id)?.dataset.motion).toBe("landing");
  await vi.waitFor(() => expect(courier()).toBeTruthy());

  // The courier re-measures a frame later, once the list makes room for him.
  const list = app.querySelector<HTMLElement>(".diff-lenses")!;
  await vi.waitFor(() =>
    expect(parseFloat(courier()!.style.top)).toBeCloseTo(
      row(docs.id)!.getBoundingClientRect().top -
        list.getBoundingClientRect().top +
        list.scrollTop,
      0,
    ),
  );

  // The row lands and settles; the files it groups are never listed under it.
  await manualClock.advance(520);
  expect(row(docs.id)?.dataset.motion).toBeUndefined();
  expect(row(docs.id)?.querySelector("ul, li")).toBeNull();

  // A removed row stays in its place while it is erased, then goes.
  await render({
    lenses: [docs],
    version: 3,
    lensCursor: lensEdit("remove", api.id),
  });
  expect(
    [...app.querySelectorAll("[data-lens-id]")].map((item) =>
      item.getAttribute("data-lens-id"),
    ),
  ).toEqual([api.id, docs.id, "automatic-uncategorized"]);
  expect(row(api.id)?.dataset.motion).toBe("erasing");
  await manualClock.advance(520);
  expect(row(api.id)).toBeNull();
});

it("sends the top-bar badge to the Diffs page while only lenses are written", async () => {
  await render({
    lenses: [api, docs],
    version: 2,
    lensCursor: { targetId: api.id, blockId: api.id, source: "focus", seq: 1 },
  });
  expect(navigationButton().getAttribute("aria-expanded")).toBe("false");

  const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView");

  const badge = app.querySelector<HTMLButtonElement>(
    "button.host-authoring-activity",
  )!;

  await act(async () => badge.click());
  expect(onLocate).toHaveBeenCalledWith("diff");
  await vi.waitFor(() => expect(scroll).toHaveBeenCalled());
  await vi.waitFor(() => expect(courier()!.dataset.motion).toBe("jumping"));

  // With the document being written too, the badge keeps going to the
  // document's courier.
  onLocate.mockClear();
  await render({
    lenses: [api, docs],
    version: 2,
    activity: both,
    lensCursor: { targetId: api.id, blockId: api.id, source: "focus", seq: 1 },
    documentCursor: { targetId: "b1", blockId: "b1", source: "focus", seq: 1 },
  });
  await act(async () =>
    app
      .querySelector<HTMLButtonElement>("button.host-authoring-activity")!
      .click(),
  );
  expect(onLocate).toHaveBeenCalledWith("review");
  scroll.mockRestore();
});

it("keeps the lens filter when navigation closes, opens files, and clears with No lens", async () => {
  await render({ lenses: [api, docs], version: 1, lensCursor: null });
  await openNavigation();
  await vi.waitFor(() => expect(row(api.id)).not.toBeNull());
  await act(async () =>
    row(api.id)!
      .querySelector<HTMLButtonElement>("button[aria-pressed]")!
      .click(),
  );
  expect(navigationButton().textContent).toContain("API");

  await act(async () => navigationButton().click());
  expect(row(api.id)).toBeNull();
  await openNavigation();
  expect(
    row(api.id)!
      .querySelector("button[aria-pressed]")!
      .getAttribute("aria-pressed"),
  ).toBe("true");

  await act(async () =>
    toggleSlot
      .querySelector<HTMLButtonElement>('[data-diff-navigation="files"]')!
      .click(),
  );
  expect(row(api.id)).toBeNull();
  expect(
    app
      .querySelector<HTMLElement>(".diff-native-tree")
      ?.parentElement?.checkVisibility(),
  ).toBe(true);
  await openNavigation();
  await act(async () =>
    [...app.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("No lens"))!
      .click(),
  );
  expect(navigationButton().textContent).toContain("No lens");
  expect(
    row(api.id)!
      .querySelector("button[aria-pressed]")!
      .getAttribute("aria-pressed"),
  ).toBe("false");
});
