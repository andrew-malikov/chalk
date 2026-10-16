// oxlint-enable no-restricted-imports
import { mountReviewCanvas } from "@canvas/desktop-entry";
import {
  fixtureReviewBridge,
  libavoidWasmUrl,
} from "@canvas/test/fixture-review-bridge";
import {
  type ReviewCliInstallStatus,
  type ReviewDesktopVerbFrame,
  parseJsonText,
} from "@chalk/review-contracts";
import { defineSoftwareMap } from "@review/software-map/software-map-model";
// oxlint-disable no-restricted-imports -- Integration test imports the native app adapter alongside the canvas.
import { createCanvasUi } from "@shell/canvas-ui";
import { defaultPreferences } from "@shell/rpc";
import type { AppRPCClient, HostState } from "@shell/rpc";
import { mountElectrobunShell } from "@shell/shell";
import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

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

let catalogValues: Array<
  Omit<(typeof summaries)[number], "dismissedAt"> & {
    dismissedAt: string | null;
  }
> = [];

let commands: unknown[] = [];

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
  catalogValues = emptyCatalog ? [] : [...summaries];
  commands = [];
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
          path: "/tmp/chalk",
          installed: commandInstalled,
          profileConfigured: commandInstalled,
          onPath: false,
        },
        cli: { path: "/tmp/cli.js", version: "0.2.0" },

        connect: {
          command: "chalk",
          args: ["mcp"],
          prompts: {
            claude: "Connect Claude",
            codex: "Connect Codex",
            opencode: "Connect OpenCode",
            pi: "Connect Pi",
            omp: "Connect omp",
            copilot: "Connect Copilot",
          },
          plugins: {
            claude: { label: "Claude" },
            codex: { label: "Codex" },
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
          { output: "Cannot write the chalk command." },
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

    if (url.pathname === "/reviews-api/commands") {
      commands.push(JSON.parse(String(init?.body)).operation);

      return Response.json({ ok: true });
    }

    if (url.pathname === "/reviews-api" || url.pathname === "/reviews-api/")
      return Response.json(catalogValues);

    if (url.pathname.endsWith("/navigator"))
      return Response.json({
        rootPath: `/tmp/${url.pathname.split("/")[2]}`,
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

const activeReview = () =>
  container
    .querySelector(".review-shell-review-panel:not([hidden])")
    ?.getAttribute("aria-label");

const openReviews = () =>
  [...container.querySelectorAll(".review-shell-review-panel")].map((section) =>
    section.getAttribute("aria-label"),
  );

async function choose(label: string) {
  await act(async () => mounted!.command("commandPalette"));

  const item = [...container.querySelectorAll<HTMLElement>("[cmdk-item]")].find(
    (item) => item.textContent?.includes(label),
  )!;

  await act(async () => item.click());
}

const button = (label: string) =>
  [...container.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  )!;

test("opens a review once from the palette and closes to Home", async () => {
  const rpc = await setup([b], b);
  await expect.poll(activeReview).toBe("Beta");
  await choose("Alpha");
  await expect.poll(activeReview).toBe("Alpha");
  await choose("Alpha");
  expect(openReviews()).toEqual(["Beta", "Alpha"]);
  await act(async () => mounted?.command("closeTab"));
  expect(activeReview()).toBe("Beta");
  await act(async () => mounted?.command("closeTab"));
  expect(activeReview()).toBeUndefined();
  expect(container.textContent).toContain("Select a review");
  expect(rpc.request.setPreferences).toHaveBeenCalled();
});

test("settling the shown review moves on to the next and the palette restores it", async () => {
  await setup([a], a);
  await expect.poll(activeReview).toBe("Alpha");
  catalogValues = catalogValues.map((item) =>
    item.reviewId === a
      ? { ...item, dismissedAt: "2026-10-16T00:00:00.000Z" }
      : item,
  );
  await act(async () => catalogUpdates.forEach((push) => push()));
  await expect.poll(activeReview).toBe("Beta refreshed");
  expect(openReviews()).toEqual(["Beta refreshed"]);
  await choose("Alpha");
  expect(commands).toContainEqual({
    type: "attention",
    reviewId: a,
    action: "restore",
  });
  await expect.poll(activeReview).toBe("Alpha");
});

test("restores catalog reviews and drops missing review IDs", async () => {
  await setup([a, "missing", b], b);
  await expect.poll(activeReview).toBe("Beta");
  expect(openReviews()).toEqual(["Alpha", "Beta"]);
  expect(container.textContent).not.toContain("missing");
});

test("title bar opens the selected source directory and closing Settings preserves its review", async () => {
  const rpc = await setup([a, b], a);
  await expect.poll(() => container.textContent).toContain("Alpha document");
  await choose("Beta");
  await expect.poll(activeReview).toBe("Beta");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Open in VS Code"]')!
      .click(),
  );
  await vi.waitFor(() =>
    expect(rpc.request.openSource).toHaveBeenCalledWith({
      kind: "directory",
      rootPath: `/tmp/${b}`,
    }),
  );
  await act(async () => mounted!.command("settings"));
  await act(async () => mounted!.command("closeTab"));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(activeReview()).toBe("Beta");
});

test("disposing the shell cancels application and canvas streams", async () => {
  await setup([a], a);
  await expect.poll(() => activeStreams).toBeGreaterThan(0);
  await act(async () => mounted?.dispose());
  mounted = undefined;
  await expect.poll(() => activeStreams).toBe(0);
  expect(container.childElementCount).toBe(0);
});

test("appearance reaches the shell and modal Escape restores trigger focus", async () => {
  await setup();
  await expect.poll(() => container.textContent).toContain("Alpha");

  await act(async () => mounted!.command("settings"));
  const dialog = container.querySelector('[role="dialog"]')!;
  const select = dialog.querySelector<HTMLSelectElement>("select")!;
  await act(async () => {
    select.value = "light";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect
    .poll(() =>
      container.querySelector(".review-shell")?.getAttribute("data-theme"),
    )
    .toBe("light");
  await act(async () => userEvent.keyboard("{Escape}"));
  expect(container.querySelector('[role="dialog"]')).toBeNull();

  const trigger = container.querySelector<HTMLButtonElement>(
    '[aria-label="Search reviews"]',
  )!;

  trigger.focus();
  await act(async () => trigger.click());
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => userEvent.keyboard("{Escape}"));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await expect.poll(() => document.activeElement).toBe(trigger);
});

test("Open in menu supports arrows, selection and Escape", async () => {
  const rpc = await setup([a], a);
  await expect.poll(() => container.textContent).toContain("Alpha document");

  const trigger = container.querySelector<HTMLButtonElement>(
    '[aria-label="Open in…"]',
  )!;

  await expect.poll(() => trigger.disabled).toBe(false);
  await act(async () => trigger.click());
  await expect.poll(() => document.activeElement?.textContent).toBe("VS Code");
  await act(async () => userEvent.keyboard("{ArrowDown}{Enter}"));
  expect(container.querySelector('[role="menu"]')).toBeNull();
  await vi.waitFor(() =>
    expect(rpc.request.openSource).toHaveBeenCalledWith({
      kind: "directory",
      rootPath: `/tmp/${a}`,
      app: "zed",
    }),
  );
  await act(async () => trigger.click());
  await act(async () =>
    container
      .querySelector('[role="menu"]')
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
  );
  expect(container.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("keyboard close operates on the active review", async () => {
  await setup([a], a);
  await expect.poll(() => container.textContent).toContain("Alpha document");
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
  expect(activeReview()).toBeUndefined();
  expect(openReviews()).toEqual([]);
});

test("system appearance updates the shell", async () => {
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
  await setup([a], a);
  await expect.poll(activeReview).toBe("Alpha");

  const theme = () =>
    container.querySelector(".review-shell")?.getAttribute("data-theme");

  expect(theme()).toBe("light");
  await act(async () => {
    query.matches = true;
    query.dispatchEvent(new Event("change"));
  });
  await expect.poll(theme).toBe("dark");
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

  let cancel!: Promise<boolean>;
  await act(async () => {
    cancel = ui.confirmDelete!("Alpha");
  });
  await act(async () => userEvent.keyboard("{Escape}"));
  expect(await cancel).toBe(false);
  expect(document.activeElement).toBe(trigger);
  let approve!: Promise<boolean>;
  await act(async () => {
    approve = ui.confirmDelete!("Alpha");
  });
  await act(async () =>
    page.getByRole("button", { name: "Delete", exact: true }).click(),
  );
  expect(await approve).toBe(true);
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = ui.confirmDelete!("Alpha");
  });
  await act(async () => ui.dispose());
  expect(await pending).toBe(false);
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
});

test("command setup installs the command and unlocks agent setup and the tutorial", async () => {
  await setup([], null, true);
  await choose("Command setup");
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Install chalk in PATH"),
  );
  await act(async () => button("Install chalk in PATH").click());
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Connect Claude"),
  );
  expect(installRequests).toEqual([{ token: "test", body: { shim: true } }]);

  const tour = container.querySelector<HTMLButtonElement>(
    '[aria-label="Expand Take the tour"]',
  );

  expect(tour?.disabled).toBe(false);
  await act(async () => tour!.click());
  await act(async () => button("Open the tutorial").click());
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Alpha document"),
  );
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

test("failed command installation stays on setup and can be retried", async () => {
  await setup([], null, true, 1);
  await choose("Command setup");
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Install chalk in PATH"),
  );
  await act(async () => button("Install chalk in PATH").click());
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Cannot write the chalk command."),
  );
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Expand Connect your agents"]',
    )?.disabled,
  ).toBe(true);
  await act(async () => button("Install chalk in PATH").click());
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Connect Claude"),
  );
  expect(container.textContent).not.toContain(
    "Cannot write the chalk command.",
  );
});

test("the tutorial has a guide, and finishes with its progress saved", async () => {
  const rpc = await setup([], null, true, 0, tutorial);
  await choose("Tutorial");
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

  const guideButton = (label: string) =>
    [
      ...container.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Tutorial guide"] button',
      ),
    ].find((button) => button.textContent === label);

  while (guideButton("Next")) {
    const before = container
      .querySelector('[aria-label="Tutorial guide"]')!
      .getAttribute("data-tutorial-step");

    await act(async () => guideButton("Next")!.click());
    await vi.waitFor(() =>
      expect(
        container
          .querySelector('[aria-label="Tutorial guide"]')
          ?.getAttribute("data-tutorial-step"),
      ).not.toBe(before),
    );
  }

  await act(async () => guideButton("Finish tour")!.click());
  await vi.waitFor(() =>
    expect(openReviews()).not.toContain("Hidden tutorial"),
  );
  expect(rpc.request.setPreferences).toHaveBeenCalledWith(
    expect.objectContaining({
      tutorialProgress: expect.objectContaining({
        checked: expect.arrayContaining(["getHelp"]),
      }),
    }),
  );
});

test("the palette tutorial opens through the sidecar without CLI installation", async () => {
  await setup([b], b);
  await expect.poll(activeReview).toBe("Beta");
  await choose("Tutorial");
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Alpha document"),
  );
  expect(activeReview()).toBe("Alpha");
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
  expect(activeReview()).toBe("Alpha");
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

  const section = container.querySelector('section[aria-label="Alpha"]')!;

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
  expect(activeReview()).toBe("Hidden tutorial");
  await act(async () => catalogUpdates.forEach((push) => push()));
  await vi.waitFor(() => expect(openReviews()).toContain("Hidden tutorial"));
  expect(openReviews()).not.toContain("deleted-review");
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
    expect(container.textContent).toContain("Reconnecting to review server"),
  );
  expect(container.querySelector("main")!.inert).toBe(true);
  await vi.waitFor(() => expect(controlAttachments).toBe(2), { timeout: 4000 });
  await vi.waitFor(() =>
    expect(container.querySelector("main")!.inert).toBe(false),
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
  expect(activeReview()).toBe("Alpha");
});
