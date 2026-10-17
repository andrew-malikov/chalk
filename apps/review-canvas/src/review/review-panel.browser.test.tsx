import { ReviewSessionProvider } from "@canvas/host/review-session";
import { ReviewDebugSettingsProvider } from "@canvas/settings/debug-settings";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import { REVIEW_CANVAS_RESUME_EVENT } from "@chalk/review-contracts";
import type { AnchorRef } from "@review/documents/authoring";
import {
  type ReactNode,
  StrictMode,
  act,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GuidedTourPanel,
  ReviewPanelFrame,
  ReviewPanelHost,
} from "./review-components";
import { ReviewProvider } from "./review-context";
import {
  ReviewPanelProvider,
  useOptionalReviewPanel,
  useReviewPanel,
  useReviewPanelActor,
  useSuppressPanelMotionOnCanvasResume,
} from "./review-panel";
import type { ReviewPanelActor } from "./review-panel-machine";
import type { GuidedTour } from "./review-panel-model";

let root: ReturnType<typeof createRoot> | undefined;

const session = testReviewSession();

// The scroller under the panel header.
const panelBodySelector = ".side-panel > header + div";

function entranceAnimation(container: HTMLElement) {
  return getComputedStyle(container.querySelector(".side-panel")!)
    .animationName;
}

function renderWithSession(node: ReactNode) {
  root!.render(
    <ReviewSessionProvider session={session}>{node}</ReviewSessionProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({}))),
  );
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn<(options?: ScrollToOptions | number, y?: number) => void>(),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);

    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn<(handle: number) => void>());
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Review panel host", () => {
  it("keeps a docked tour panel at full height inside a narrow canvas", async () => {
    const container = document.createElement("div");
    container.style.cssText =
      "container: review-canvas / inline-size; width: 640px; height: 500px";
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      renderWithSession(
        <ReviewPanelProvider>
          <ReviewPanelFrame
            tour
            docked
            title="Tour"
            closeLabel="Close tour"
            onClose={() => {}}
          >
            <p>First stop</p>
          </ReviewPanelFrame>
        </ReviewPanelProvider>,
      );
    });

    expect(
      container.querySelector("aside")!.getBoundingClientRect().height,
    ).toBe(500);
  });

  it("replaces the active panel when a document peek opens", async () => {
    const addEventListener = vi.spyOn(document, "addEventListener");
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      renderWithSession(
        <ReviewDebugSettingsProvider>
          <ReviewProvider>
            <ReviewPanelProvider>
              <OpenReplacingPanel />
              <ReviewPanelHost />
            </ReviewPanelProvider>
          </ReviewProvider>
        </ReviewDebugSettingsProvider>,
      );
      await Promise.resolve();
    });

    expect(container.querySelectorAll(".side-panel")).toHaveLength(1);
    expect(container.querySelectorAll(panelBodySelector)).toHaveLength(1);
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(container.textContent).not.toContain("Earlier detail");
    expect(container.textContent).toContain("Startup detail");
    expect(
      addEventListener.mock.calls.filter(([type]) => type === "keydown"),
    ).toHaveLength(1);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Close side peek"]')!
        .click();
    });

    expect(container.querySelectorAll(".side-panel")).toHaveLength(0);
    expect(container.querySelectorAll(panelBodySelector)).toHaveLength(0);
  });

  it("marks a restored panel so its entrance motion can be suppressed", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      renderWithSession(
        <ReviewDebugSettingsProvider>
          <ReviewProvider>
            <ReviewPanelProvider>
              <RestorePeekPanel />
              <ReviewPanelHost />
            </ReviewPanelProvider>
          </ReviewProvider>
        </ReviewDebugSettingsProvider>,
      );
      await Promise.resolve();
    });

    expect(entranceAnimation(container)).toBe("none");
  });

  it("suppresses panel motion when the cached canvas resumes", async () => {
    const canvas = document.createElement("div");
    canvas.className = "review-canvas-root";
    const container = document.createElement("div");
    canvas.append(container);
    document.body.append(canvas);
    root = createRoot(container);

    await act(async () => {
      renderWithSession(
        <ReviewDebugSettingsProvider>
          <ReviewProvider>
            <ReviewPanelProvider>
              <OpenPeekPanel />
              <ResumeMotionListener />
              <ReviewPanelHost />
            </ReviewPanelProvider>
          </ReviewProvider>
        </ReviewDebugSettingsProvider>,
      );
      await Promise.resolve();
    });

    expect(entranceAnimation(container)).not.toBe("none");

    await act(async () => {
      canvas.dispatchEvent(new Event(REVIEW_CANVAS_RESUME_EVENT));
    });

    expect(entranceAnimation(container)).toBe("none");
  });
});

describe("Review panel actor lifecycle", () => {
  it("keeps restored navigation usable through Strict Mode replay", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const capture = vi.fn<(actor: ReviewPanelActor) => void>();

    await act(async () => {
      root!.render(
        <StrictMode>
          <ReviewPanelProvider restore={() => ({ view: "diff" })}>
            <PanelActorProbe capture={capture} />
          </ReviewPanelProvider>
        </StrictMode>,
      );
    });

    expect(container.textContent).toBe("diff");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toBe("review");
  });

  it("disposes a removed review without interrupting its sibling", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const captureFirst = vi.fn<(actor: ReviewPanelActor) => void>();
    const captureSecond = vi.fn<(actor: ReviewPanelActor) => void>();

    const render = (first: boolean) =>
      root!.render(
        <>
          {first && (
            <ReviewPanelProvider key="first">
              <PanelActorProbe capture={captureFirst} />
            </ReviewPanelProvider>
          )}
          <ReviewPanelProvider key="second">
            <PanelActorProbe capture={captureSecond} />
          </ReviewPanelProvider>
        </>,
      );

    await act(async () => render(true));
    const first = captureFirst.mock.calls[0]![0];
    const second = captureSecond.mock.calls[0]![0];
    await act(async () => first.send({ type: "showView", view: "diff" }));
    expect(container.textContent).toBe("diffreview");

    await act(async () => render(false));
    await act(async () => {
      first.send({ type: "showView", view: "map" });
      second.send({ type: "showView", view: "commits" });
    });

    expect(first.getSnapshot().value).toBe("diff");
    expect(container.textContent).toBe("commits");
    expect(captureSecond.mock.calls.at(-1)![0]).toBe(second);
  });

  it("allows optional consumers outside a provider", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root!.render(<OptionalPanelProbe />));
    expect(container.textContent).toBe("no review");
  });
});

function PanelActorProbe({
  capture,
}: {
  capture(actor: ReviewPanelActor): void;
}) {
  const actor = useReviewPanelActor();
  const view = useReviewPanel((snapshot) => snapshot.value);
  useEffect(() => capture(actor), [actor, capture]);

  return (
    <button onClick={() => actor.send({ type: "showView", view: "review" })}>
      {view}
    </button>
  );
}

function OptionalPanelProbe() {
  const view = useOptionalReviewPanel((snapshot) => snapshot.value);

  return <span>{view ?? "no review"}</span>;
}

describe("Guided tour panel", () => {
  it("activates the tour stop that crosses the panel reading line", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      renderWithSession(
        <ReviewDebugSettingsProvider>
          <ReviewProvider>
            <ReviewPanelProvider>
              <TourPanel />
            </ReviewPanelProvider>
          </ReviewProvider>
        </ReviewDebugSettingsProvider>,
      );
      await Promise.resolve();
    });

    const scrollTo = vi.mocked(HTMLElement.prototype.scrollTo);
    scrollTo.mockClear();
    const body = container.querySelector<HTMLElement>(panelBodySelector)!;

    const [firstStop, secondStop] = [
      ...container.querySelectorAll<HTMLElement>(
        "section[data-review-anchor-id]",
      ),
    ];

    vi.spyOn(body, "getBoundingClientRect").mockReturnValue(
      domRect({ top: 100, bottom: 600, height: 500 }),
    );
    vi.spyOn(firstStop!, "getBoundingClientRect").mockReturnValue(
      domRect({ top: -160, bottom: 80, height: 240 }),
    );
    vi.spyOn(secondStop!, "getBoundingClientRect").mockReturnValue(
      domRect({ top: 112, bottom: 352, height: 240 }),
    );

    await act(async () => {
      body.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(
      container.querySelector("[data-active-tour-anchor]")?.textContent,
    ).toBe("second");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("keeps tour navigation outside the scroller and reveals selected stops", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      renderWithSession(
        <ReviewDebugSettingsProvider>
          <ReviewProvider>
            <ReviewPanelProvider>
              <TourPanel />
            </ReviewPanelProvider>
          </ReviewProvider>
        </ReviewDebugSettingsProvider>,
      );
      await Promise.resolve();
    });

    const body = container.querySelector<HTMLElement>(panelBodySelector)!;

    const floatingFooter = container.querySelector<HTMLElement>(
      ".side-panel > :last-child",
    )!;

    expect(body.contains(floatingFooter)).toBe(false);
    expect(floatingFooter.textContent).toContain("1 more steps");

    await act(async () => {
      floatingFooter.querySelector<HTMLButtonElement>("button")!.click();
    });

    expect(
      container.querySelector("[data-active-tour-anchor]")?.textContent,
    ).toBe("second");
    expect(floatingFooter.querySelector(".tour-pill-count")?.textContent).toBe(
      "2/2",
    );
    expect(
      floatingFooter.querySelector<HTMLButtonElement>(
        '[aria-label="Next step"]',
      )?.disabled,
    ).toBe(true);

    await act(async () => {
      floatingFooter
        .querySelector<HTMLButtonElement>('[aria-label="Previous step"]')!
        .click();
    });

    expect(
      container.querySelector("[data-active-tour-anchor]")?.textContent,
    ).toBe("first");
    expect(floatingFooter.querySelector(".tour-pill-count")?.textContent).toBe(
      "1/2",
    );
    expect(
      floatingFooter.querySelector<HTMLButtonElement>(
        '[aria-label="Previous step"]',
      )?.disabled,
    ).toBe(true);
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
  });
});

function OpenReplacingPanel() {
  const actor = useReviewPanelActor();
  useEffect(() => {
    actor.send({
      type: "openPeek",
      panel: {
        kind: "peek",
        anchor: { id: "earlier", title: "Earlier detail" } as AnchorRef,
        content: { kind: "inline-code", text: "earlier();" },
      },
    });
    actor.send({
      type: "openPeek",
      panel: {
        kind: "peek",
        anchor: { id: "startup", title: "Startup detail" } as AnchorRef,
        content: { kind: "inline-code", text: "start();" },
      },
    });
  }, [actor]);

  return null;
}

const peekFixture = {
  kind: "peek",
  anchor: { id: "startup", title: "Startup detail" } as AnchorRef,
  content: { kind: "inline-code", text: "start();" },
} as const;

function OpenPeekPanel() {
  const actor = useReviewPanelActor();
  useEffect(
    () => actor.send({ type: "openPeek", panel: peekFixture }),
    [actor],
  );

  return null;
}

function RestorePeekPanel() {
  const actor = useReviewPanelActor();
  useEffect(() => {
    actor.send({ type: "openPeek", panel: peekFixture });
    actor.send({ type: "suppressMotion" });
  }, [actor]);

  return null;
}

function tourFixture(): GuidedTour {
  const first = { id: "first", title: "First" } as AnchorRef;
  const second = { id: "second", title: "Second" } as AnchorRef;

  return {
    id: "tour",
    stops: [
      {
        anchor: first,
        label: "First",
        content: { kind: "inline-code", text: "first();" },
      },
      {
        anchor: second,
        label: "Second",
        content: { kind: "inline-code", text: "second();" },
      },
    ],
  };
}

function ResumeMotionListener() {
  const appRef = useRef<HTMLDivElement | null>(null);
  useSuppressPanelMotionOnCanvasResume(appRef);

  return <div ref={appRef} />;
}

function TourPanel() {
  const [tour, setTour] = useState({ anchor: "first", revealRequest: 1 });

  return (
    <>
      <GuidedTourPanel
        tour={tourFixture()}
        activeAnchor={tour.anchor}
        revealRequest={tour.revealRequest}
        onActiveAnchorChange={(anchor, { reveal }) =>
          setTour((previous) => ({
            anchor,
            revealRequest: previous.revealRequest + Number(reveal),
          }))
        }
        onClose={() => {}}
      />
      <output data-active-tour-anchor>{tour.anchor}</output>
    </>
  );
}

function domRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 320,
    height: 0,
    top: 0,
    right: 320,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
    ...overrides,
  };
}
