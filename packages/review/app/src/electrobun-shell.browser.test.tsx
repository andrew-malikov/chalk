// oxlint-enable no-restricted-imports
import { mountReviewCanvas } from "@canvas/desktop-entry";
import {
  fixtureReviewBridge,
  libavoidWasmUrl,
} from "@canvas/fixture-review-bridge";
import {
  type ReviewCliInstallStatus,
  type ReviewDesktopVerbFrame,
  parseJsonText,
} from "@dev.fast/review-protocol";
import { defineSoftwareMap } from "@review/software-map-model";
import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

// oxlint-disable no-restricted-imports -- Integration test imports the native app adapter alongside the canvas.
import { createCanvasUi } from "../../../../apps/review-electrobun/src/canvas-ui";
import { defaultPreferences } from "../../../../apps/review-electrobun/src/rpc";
import type {
  AppRPCClient,
  HostState,
} from "../../../../apps/review-electrobun/src/rpc";
import { mountElectrobunShell } from "../../../../apps/review-electrobun/src/shell";

const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";

const summaries = [
  {
    reviewId: a,
    title: "Alpha",
    version: 0,
    repositoryName: "demo",
    viewedAt: null,
    dismissedAt: null,
  },
  {
    reviewId: b,
    title: "Beta",
    version: 0,
    repositoryName: "demo",
    viewedAt: null,
    dismissedAt: null,
  },
];

const fixtures = new Map(
  summaries.map((summary) => [
    summary.reviewId,
    fixtureReviewBridge({
      snapshot: {
        ...summary,
        createdAt: "2026-10-04T00:00:00.000Z",
        document: [
          {
            id: "paragraph",
            type: "markdown",
            markdown: summary.title + " document",
          },
        ],
      },
    }),
  ]),
);

const c = "33333333-3333-4333-8333-333333333333";

fixtures.set(
  c,
  fixtureReviewBridge({
    snapshot: {
      reviewId: c,
      title: "New incoming review",
      version: 0,
      createdAt: "2026-10-04T00:00:00.000Z",
      document: [
        {
          id: "new-paragraph",
          type: "markdown",
          markdown: "Incoming full document",
        },
      ],
    },
  }),
);

const tutorial = "44444444-4444-4444-8444-444444444444";

fixtures.set(
  tutorial,
  fixtureReviewBridge({
    snapshot: {
      reviewId: tutorial,
      title: "Hidden tutorial",
      version: 0,
      createdAt: "2026-10-04T00:00:00.000Z",
      origin: { tutorial: true },
      document: [
        { id: "tour", type: "markdown", markdown: "Managed tutorial document" },
        { id: "tutorial-map", type: "software_map", mapVersionId: c },
        { id: "tutorial-keys", type: "tutorial", kind: "keymap" },
      ],
    },
    maps: {
      [c]: parseJsonText(
        JSON.stringify({
          ...defineSoftwareMap({
            systems: { sample: { label: "Sample service" } },
          }),
          side: "head",
          commit: "head",
          countsByElementPath: {},
          unmappedByElementPath: {},
        }),
      ),
    },
  }),
);

let catalogUpdates: Array<() => void> = [];

let closeControl: () => void;

let healthFailures = 0;

let controlAttachments = 0;

let mounted: ReturnType<typeof mountElectrobunShell> | undefined;

let container: HTMLDivElement;

let activeStreams = 0;

let controlFrame: (frame: ReviewDesktopVerbFrame) => void;

let controlResults: unknown[] = [];

let installRequests: Array<{ token: string | null; body: unknown }> = [];

afterEach(async () => {
  await act(async () => mounted?.dispose());
  container?.remove();
  vi.unstubAllGlobals();
});

async function setup(
  reviewIds: string[] = [],
  activeReviewId: string | null = null,
  emptyCatalog = false,
  installFailures = 0,
  tutorialReviewId = a,
) {
  activeStreams = 0;
  controlResults = [];
  installRequests = [];
  catalogUpdates = [];
  healthFailures = 0;
  controlAttachments = 0;
  let catalogValues = emptyCatalog ? [] : [...summaries];
  let commandInstalled = false;
  let preferences = { ...defaultPreferences, reviewIds, activeReviewId };

  const rpc: AppRPCClient = {
    request: {
      getState: async () => state,
      setPreferences: vi.fn<AppRPCClient["request"]["setPreferences"]>(
        async (patch) => (preferences = { ...preferences, ...patch }),
      ),
      openSource: vi.fn<AppRPCClient["request"]["openSource"]>(async () => {}),
      openExternal: vi.fn<AppRPCClient["request"]["openExternal"]>(
        async () => {},
      ),
      focusWindow: vi.fn<AppRPCClient["request"]["focusWindow"]>(
        async () => {},
      ),
    },
    send: { diagnostic: vi.fn<AppRPCClient["send"]["diagnostic"]>() },
  };

  const state: Extract<HostState, { status: "ready" }> = {
    status: "ready",
    discovery: {
      version: 3,
      url: "http://127.0.0.1:5570",
      token: "test",
      instanceId: "test",
      appPid: 1,
      serverPid: 2,
      startedAt: 1,
    },
    preferences,
    appSessionId: "test",
  };

  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));

    if (url.pathname === "/install/status") {
      const status: ReviewCliInstallStatus = {
        fingerprint: "test",
        stamp: null,
        stale: false,
        updateNeeded: false,
        shim: {
          path: "/tmp/blackboard",
          installed: commandInstalled,
          profileConfigured: commandInstalled,
          onPath: false,
        },
        cli: { path: "/tmp/cli.js", version: "0.2.0" },
        trace: {
          enabled: false,
          configured: false,
          autoActivateRepositories: false,
          envPath: "/tmp/env",
          settingsPath: "/tmp/settings",
        },
        legacySkills: [],
        connect: {
          command: "blackboard",
          args: ["mcp"],
          prompts: {
            claude: "Connect Claude",
            codex: "Connect Codex",
            cursor: "Connect Cursor",
            opencode: "Connect OpenCode",
            pi: "Connect Pi",
            omp: "Connect omp",
            copilot: "Connect Copilot",
          },
          plugins: {
            claude: { label: "Claude" },
            codex: { label: "Codex" },
            cursor: { label: "Cursor" },
            opencode: { label: "OpenCode" },
            pi: { label: "Pi" },
            omp: { label: "omp" },
            copilot: { label: "Copilot" },
          },
        },
      };

      return Response.json(status);
    }

    if (url.pathname === "/install/apply") {
      installRequests.push({
        token: new Headers(init?.headers).get("x-review-token"),
        body: JSON.parse(String(init?.body)),
      });

      if (installFailures-- > 0)
        return Response.json(
          { output: "Cannot write the blackboard command." },
          { status: 500 },
        );
      commandInstalled = true;

      return Response.json({ ok: true, output: "Installed" });
    }

    if (
      url.pathname === `/reviews-api/${c}` &&
      !catalogValues.some((item) => item.reviewId === c)
    )
      catalogValues.push({
        ...summaries[0]!,
        reviewId: c,
        title: "New incoming review",
      });

    if (
      url.pathname === `/reviews-api/${c}` &&
      url.searchParams.get("full") !== "true"
    )
      return Response.json("Numbered document inspection");

    if (url.pathname === "/health") {
      if (healthFailures > 0) {
        healthFailures--;

        return Response.json({}, { status: 503 });
      }

      return Response.json({ instanceId: "test" });
    }

    if (url.pathname === "/control/result") {
      controlResults.push(JSON.parse(String(init?.body)));

      return Response.json({ ok: true });
    }

    if (url.pathname === "/control" || url.pathname.endsWith("/watch")) {
      let ended = false;
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      activeStreams++;

      const end = () => {
        if (ended) return;
        ended = true;
        activeStreams--;
      };

      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
        cancel: end,
      });

      if (url.pathname === "/control") {
        controlAttachments++;
        closeControl = () => {
          controller.close();
          end();
        };

        controlFrame = (frame) =>
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`),
          );
      }

      if (url.pathname.endsWith("/watch")) {
        const subscriptions = JSON.parse(
          url.searchParams.get("subscriptions") ?? "[]",
        ) as { reviewId: string | null }[];

        const results = await Promise.all(
          subscriptions.map(async ({ reviewId }) => ({
            value:
              reviewId === null
                ? catalogValues
                : {
                    ...(await fixtures
                      .get(reviewId)!
                      .request(
                        `http://127.0.0.1:5570/reviews-api/${reviewId}?full=true`,
                      )
                      .then((response) => response.json())),
                    activity: "unknown",
                  },
          })),
        );

        controller.enqueue(
          new TextEncoder().encode(JSON.stringify(results) + "\n"),
        );
        catalogUpdates.push(() => {
          if (!ended)
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify(
                  results.map((result, index) =>
                    subscriptions[index]?.reviewId === null
                      ? {
                          value: catalogValues.map((item) => ({
                            ...item,
                            title: item.title + " refreshed",
                          })),
                        }
                      : result,
                  ),
                ) + "\n",
              ),
            );
        });
      }

      init?.signal?.addEventListener(
        "abort",
        () => {
          if (!ended) {
            controller.close();
            end();
          }
        },
        { once: true },
      );

      return new Response(stream);
    }

    if (url.pathname === "/tutorial/prepare")
      return Response.json({ ok: true, reviewUuid: tutorialReviewId });

    if (url.pathname === "/reviews-api/commands")
      return Response.json({ ok: true });

    if (url.pathname === "/reviews-api" || url.pathname === "/reviews-api/")
      return Response.json(catalogValues);

    if (url.pathname.endsWith("/navigator"))
      return Response.json({
        workspacePath: `/tmp/${url.pathname.split("/")[2]}`,
      });

    const id = url.pathname.split("/")[2];
    const fixture = fixtures.get(id ?? "");

    if (fixture) return fixture.request(url.href, init);

    return Response.json({ error: "not found" }, { status: 404 });
  });
  container = document.createElement("div");
  container.style.height = "700px";
  document.body.append(container);
  await act(async () => {
    mounted = mountElectrobunShell(container, {
      state,
      rpc,
      wasmUrl: libavoidWasmUrl,
    });
  });

  return rpc;
}

test("opens singleton review tabs and closes to Home", async () => {
  const rpc = await setup();
  await expect.poll(() => container.textContent).toContain("Alpha");
  await act(async () => {
    Array.from(container.querySelectorAll("button"))
      .find((el) => el.textContent?.includes("Alpha"))
      ?.click();
  });
  await expect
    .poll(
      () =>
        container.querySelectorAll('[role="tab"][aria-label="Alpha"]').length,
    )
    .toBe(1);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Go Home"]')!
      .click(),
  );
  await act(async () => {
    Array.from(container.querySelectorAll("button"))
      .find((el) => el.textContent?.includes("Alpha"))
      ?.click();
  });
  expect(
    container.querySelectorAll('[role="tab"][aria-label="Alpha"]').length,
  ).toBe(1);
  await act(async () => mounted?.command("closeTab"));
  expect(
    container
      .querySelector('[aria-label="Go Home"]')
      ?.getAttribute("aria-current"),
  ).toBe("page");
  expect(rpc.request.setPreferences).toHaveBeenCalled();
});

test("restores catalog tabs and drops missing review IDs", async () => {
  await setup([a, "missing", b], b);
  await expect
    .poll(() =>
      container
        .querySelector('[role="tab"][aria-label="Beta"]')
        ?.getAttribute("aria-selected"),
    )
    .toBe("true");
  expect(container.querySelectorAll('[role="tab"]').length).toBe(2);
  expect(container.textContent).not.toContain("missing");
});

test("title bar opens the selected workspace and closing Settings preserves its review", async () => {
  const rpc = await setup([a, b], a);
  await expect.poll(() => container.textContent).toContain("Alpha document");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[role="tab"][aria-label="Beta"]')!
      .click(),
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Open in VS Code"]')!
      .click(),
  );
  await vi.waitFor(() =>
    expect(rpc.request.openSource).toHaveBeenCalledWith({
      kind: "workspace",
      workspacePath: `/tmp/${b}`,
    }),
  );
  await act(async () => mounted!.command("settings"));
  await act(async () => mounted!.command("closeTab"));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(
    container
      .querySelector('[role="tab"][aria-label="Beta"]')
      ?.getAttribute("aria-selected"),
  ).toBe("true");
});

test("disposing the shell cancels application and canvas streams", async () => {
  await setup([a], a);
  await expect.poll(() => activeStreams).toBeGreaterThan(0);
  await act(async () => mounted?.dispose());
  mounted = undefined;
  await expect.poll(() => activeStreams).toBe(0);
  expect(container.childElementCount).toBe(0);
});

test("appearance reaches Home and modal Escape restores trigger focus", async () => {
  await setup();
  await expect.poll(() => container.textContent).toContain("Alpha");

  const trigger = container.querySelector<HTMLButtonElement>(
    '[aria-label="Settings"]',
  )!;

  trigger.focus();
  await act(async () => trigger.click());
  const dialog = container.querySelector('[role="dialog"]')!;
  const select = dialog.querySelector<HTMLSelectElement>("select")!;
  await act(async () => {
    select.value = "light";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect
    .poll(() =>
      container
        .querySelector(
          '[role="tabpanel"][aria-label="Home"] [data-review-theme]',
        )
        ?.getAttribute("data-review-theme"),
    )
    .toBe("light");
  await act(async () => userEvent.keyboard("{Escape}"));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("canvas menu supports checked selection, arrows and Escape", async () => {
  await setup();
  await expect.poll(() => container.textContent).toContain("Alpha");

  const trigger = container.querySelector<HTMLButtonElement>(
    '[aria-label="Sort reviews"]',
  )!;

  expect(trigger.disabled).toBe(false);
  await act(async () => trigger.click());
  const menu = container.querySelector('[role="menu"]')!;
  await act(async () => {
    menu.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await act(async () => trigger.click());
  expect(
    container.querySelector('[role="menuitemradio"][aria-checked="true"]')
      ?.textContent,
  ).toContain("Oldest");
  await act(async () =>
    container
      .querySelector('[role="menu"]')
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
  );
  expect(document.activeElement).toBe(trigger);
});

test("keyboard find and close operate on the active review", async () => {
  await setup([a], a);
  await expect.poll(() => container.textContent).toContain("Alpha document");
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "f",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect
    .poll(() => container.querySelector('[aria-label="Find"]'))
    .not.toBeNull();
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "w",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(
    container
      .querySelector('[aria-label="Go Home"]')
      ?.getAttribute("aria-current"),
  ).toBe("page");
});

test("arrow keys switch retained tabs and system appearance updates Home", async () => {
  const original = window.matchMedia;

  const query = Object.assign(new EventTarget(), {
    matches: false,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener() {},
    removeListener() {},
  });

  vi.stubGlobal("matchMedia", (value: string) =>
    value === query.media ? query : original(value),
  );
  await setup([a, b], b);
  await expect
    .poll(() =>
      container
        .querySelector('[role="tab"][aria-label="Beta"]')
        ?.getAttribute("aria-selected"),
    )
    .toBe("true");

  const tab = container.querySelector<HTMLButtonElement>(
    '[role="tab"][aria-label="Alpha"]',
  )!;

  tab.focus();
  await act(async () =>
    tab.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(
    container
      .querySelector('[role="tab"][aria-label="Beta"]')
      ?.getAttribute("aria-selected"),
  ).toBe("true");
  await act(async () => {
    query.matches = true;
    query.dispatchEvent(new Event("change"));
  });
  await expect
    .poll(() =>
      container
        .querySelector(
          '[role="tabpanel"][aria-label="Home"] [data-review-theme]',
        )
        ?.getAttribute("data-review-theme"),
    )
    .toBe("dark");
});

test("non-review canvas disposes its explicit theme subscription", async () => {
  container = document.createElement("div");
  document.body.append(container);
  let update!: (value: "dark" | "light") => void;
  const unsubscribe = vi.fn<() => void>();

  const ui = createCanvasUi(
    () => container,
    {
      current: () => "light",
      subscribe: (listener) => {
        update = listener;

        return { dispose: unsubscribe };
      },
    },
    () => {},
  );

  let handle!: ReturnType<typeof mountReviewCanvas>;
  await act(async () => {
    handle = mountReviewCanvas(
      container,
      {
        kind: "home",
        reviews: [],
        openReview() {},
        deleteReview: async () => {},
        dismissReview: async () => {},
        openTutorial: async () => {},
      },
      ui,
    );
  });
  expect(container.dataset.reviewTheme).toBe("light");
  update("dark");
  expect(container.dataset.reviewTheme).toBe("dark");
  await act(async () => handle.dispose());
  ui.dispose();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test("delete confirmation settles on cancel, approval and owner disposal", async () => {
  container = document.createElement("div");
  document.body.append(container);
  const trigger = document.createElement("button");
  container.append(trigger);
  trigger.focus();

  const ui = createCanvasUi(
    () => container,
    { current: () => "dark", subscribe: () => ({ dispose() {} }) },
    () => {},
  );

  const cancel = ui.confirmDelete!("Alpha");
  container
    .querySelector<HTMLDialogElement>("dialog")!
    .dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(await cancel).toBe(false);
  expect(document.activeElement).toBe(trigger);
  const approve = ui.confirmDelete!("Alpha");
  container
    .querySelector<HTMLButtonElement>("dialog button:last-child")!
    .click();
  expect(await approve).toBe(true);
  const pending = ui.confirmDelete!("Alpha");
  ui.dispose();
  expect(await pending).toBe(false);
  expect(container.querySelector("dialog")).toBeNull();
});

test("empty Home installs the command and unlocks agent setup and the tutorial", async () => {
  await setup([], null, true);
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Install blackboard in PATH"),
  );

  const button = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Install blackboard in PATH",
  );

  await act(async () => button!.click());
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Connect Claude"),
  );
  expect(installRequests).toEqual([{ token: "test", body: { shim: true } }]);

  const tour = container.querySelector<HTMLButtonElement>(
    '[aria-label="Expand Take the tour"]',
  );

  expect(tour?.disabled).toBe(false);
  await act(async () => tour!.click());

  const open = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Open the tutorial",
  );

  await act(async () => open!.click());
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Alpha document"),
  );
});

test("failed command installation stays on setup and can be retried", async () => {
  await setup([], null, true, 1);
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Install blackboard in PATH"),
  );

  const button = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Install blackboard in PATH",
  );

  await act(async () => button!.click());
  await vi.waitFor(() =>
    expect(container.textContent).toContain(
      "Cannot write the blackboard command.",
    ),
  );
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Expand Connect your agents"]',
    )?.disabled,
  ).toBe(true);
  await act(async () => button!.click());
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Connect Claude"),
  );
  expect(container.textContent).not.toContain(
    "Cannot write the blackboard command.",
  );
});

test("the tutorial has a guide, finishes, and checks off Take the tour on Home", async () => {
  const rpc = await setup([], null, true, 0, tutorial);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Open tutorial"]')!
      .click(),
  );
  await vi.waitFor(() =>
    expect(
      container.querySelector('[aria-label="Tutorial guide"]'),
    ).not.toBeNull(),
  );

  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Hide tutorial"]')!
      .click(),
  );
  await vi.waitFor(() =>
    expect(container.querySelector('[aria-label="Tutorial guide"]')).toBeNull(),
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Show tutorial"]')!
      .click(),
  );
  await vi.waitFor(() =>
    expect(
      container.querySelector('[aria-label="Tutorial guide"]'),
    ).not.toBeNull(),
  );

  const keymap = [
    ...container.querySelectorAll('[aria-label="Keybindings"] button'),
  ].find((button) => button.textContent === "Vim") as HTMLButtonElement;

  expect(keymap.disabled).toBe(false);
  await act(async () => keymap.click());
  await vi.waitFor(() =>
    expect(
      container
        .querySelector('[aria-label="Tutorial guide"]')
        ?.getAttribute("data-tutorial-step"),
    ).toBe("showHover"),
  );
  expect(rpc.request.setPreferences).toHaveBeenCalledWith({ keymap: "vim" });

  for (let step = 0; step < 9; step++) {
    const guide = container.querySelector('[aria-label="Tutorial guide"]')!;
    const before = guide.getAttribute("data-tutorial-step");

    const next = [...guide.querySelectorAll("button")].find(
      (button) => button.textContent === "Next",
    );

    await act(async () => next!.click());
    await vi.waitFor(() =>
      expect(
        container
          .querySelector('[aria-label="Tutorial guide"]')
          ?.getAttribute("data-tutorial-step"),
      ).not.toBe(before),
    );
  }

  const finish = [
    ...container.querySelectorAll('[aria-label="Tutorial guide"] button'),
  ].find((button) => button.textContent === "Finish tour") as HTMLButtonElement;

  await act(async () => finish.click());
  await vi.waitFor(() =>
    expect(
      container.querySelector('[role="tab"][aria-label="Hidden tutorial"]'),
    ).toBeNull(),
  );
  expect(
    container
      .querySelector('[aria-label="Expand Take the tour"]')
      ?.closest("li")
      ?.getAttribute("data-state"),
  ).toBe("done");
  expect(container.textContent).toContain("11 of 11 checks");
  expect(rpc.request.setPreferences).toHaveBeenCalledWith(
    expect.objectContaining({
      tutorialProgress: expect.objectContaining({
        checked: expect.arrayContaining(["getHelp"]),
      }),
    }),
  );
});

test("Home tutorial opens through the sidecar without CLI installation", async () => {
  await setup();

  const tutorial = container.querySelector<HTMLButtonElement>(
    '[aria-label="Open tutorial"]',
  );

  expect(tutorial).not.toBeNull();
  await act(async () => tutorial!.click());
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Alpha document"),
  );
  expect(
    container
      .querySelector('[role="tab"][aria-label="Alpha"]')
      ?.getAttribute("aria-selected"),
  ).toBe("true");
});

test("agent open acknowledgment returns the server's desktop settings", async () => {
  const rpc = await setup();
  await vi.waitFor(() => expect(container.textContent).toContain("Alpha"));
  await vi.waitFor(() => expect(activeStreams).toBe(2));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  await act(async () =>
    controlFrame({
      event: "desktop-verb",
      id: "11111111-1111-4111-8111-111111111119",
      request: { name: "openApiReview", args: { reviewId: a, title: "Alpha" } },
    }),
  );
  await vi.waitFor(() => expect(controlResults).toHaveLength(1));
  expect(controlResults[0]).toMatchObject({
    response: { ok: true, result: { softwareMapEnabled: true } },
  });
  expect(rpc.request.focusWindow).toHaveBeenCalled();
  expect(
    container
      .querySelector('[role="tab"][aria-label="Alpha"]')
      ?.getAttribute("aria-selected"),
  ).toBe("true");
});

test("agent open resolves a full snapshot before the catalog contains the review", async () => {
  await setup();
  await vi.waitFor(() => expect(container.textContent).toContain("Alpha"));
  await vi.waitFor(() => expect(activeStreams).toBe(2));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  await act(async () =>
    controlFrame({
      event: "desktop-verb",
      id: "11111111-1111-4111-8111-111111111118",
      request: {
        name: "openApiReview",
        args: { reviewId: c, title: "New incoming review" },
      },
    }),
  );
  await vi.waitFor(() => expect(controlResults).toHaveLength(1));
  expect(controlResults[0]).toMatchObject({ response: { ok: true } });
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Incoming full document"),
  );
});

test("ordinary external links reach the native opener while internal anchors stay local", async () => {
  const rpc = await setup([a], a);
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Alpha document"),
  );

  const section = container.querySelector(
    '[role="tabpanel"][aria-label="Alpha"]',
  )!;

  const external = document.createElement("a");
  external.href = "https://example.com/review";
  external.target = "_blank";
  section.append(external);
  await act(async () =>
    external.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    ),
  );
  expect(rpc.request.openExternal).toHaveBeenCalledWith({
    url: "https://example.com/review",
  });
  external.href = "#paragraph";
  external.removeAttribute("target");
  await act(async () =>
    external.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    ),
  );
  expect(rpc.request.openExternal).toHaveBeenCalledTimes(1);
});

test("restores a managed tutorial absent from the catalog and keeps it through refresh", async () => {
  await setup([tutorial, "deleted-review"], tutorial);
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Managed tutorial document"),
  );
  expect(
    container
      .querySelector('[role="tab"][aria-label="Hidden tutorial"]')
      ?.getAttribute("aria-selected"),
  ).toBe("true");
  await act(async () => catalogUpdates.forEach((push) => push()));
  await vi.waitFor(() =>
    expect(
      container.querySelector('[role="tab"][aria-label="Hidden tutorial"]'),
    ).not.toBeNull(),
  );
  expect(
    container.querySelector('[role="tab"][aria-label="deleted-review"]'),
  ).toBeNull();
});

test("incoming tutorial survives the next catalog snapshot", async () => {
  await setup();
  await vi.waitFor(() => expect(activeStreams).toBe(2));
  await act(async () =>
    controlFrame({
      event: "desktop-verb",
      id: "11111111-1111-4111-8111-111111111117",
      request: {
        name: "openApiReview",
        args: { reviewId: tutorial, title: "Hidden tutorial" },
      },
    }),
  );
  await vi.waitFor(() => expect(controlResults).toHaveLength(1));
  await act(async () => catalogUpdates.forEach((push) => push()));
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Managed tutorial document"),
  );
});

test("transient health loss disables the shell and retries the live control connection", async () => {
  await setup();
  await vi.waitFor(() => expect(activeStreams).toBe(2));
  healthFailures = 1;
  await act(async () => closeControl());
  await vi.waitFor(() =>
    expect(
      container.querySelector('[aria-label="Open tutorial"]'),
    ).toHaveProperty("disabled", true),
  );
  await vi.waitFor(() => expect(controlAttachments).toBe(2), { timeout: 4000 });
  await vi.waitFor(() =>
    expect(
      container.querySelector('[aria-label="Open tutorial"]'),
    ).toHaveProperty("disabled", false),
  );
  await act(async () =>
    controlFrame({
      event: "desktop-verb",
      id: "11111111-1111-4111-8111-111111111116",
      request: { name: "openApiReview", args: { reviewId: a, title: "Alpha" } },
    }),
  );
  await vi.waitFor(() =>
    expect(controlResults[0]).toMatchObject({ response: { ok: true } }),
  );
  expect(
    container
      .querySelector('[role="tab"][aria-label="Alpha"]')
      ?.getAttribute("aria-selected"),
  ).toBe("true");
});
