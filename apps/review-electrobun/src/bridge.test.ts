import { createServer } from "node:http";

import {
  REVIEW_DESKTOP_DISCOVERY_VERSION,
  ReviewApiClient,
} from "@blackboard/review-contracts";
import { readQuerySchemas } from "@review/node/review-api/read-schemas";
import { afterEach, expect, test, vi } from "vitest";

import {
  connectControl,
  createAuthenticatedRequest,
  createCanvasBridge,
  openSourceDiff,
  openSourceFile,
} from "./bridge";
import { defaultPreferences } from "./rpc";

afterEach(() => vi.unstubAllGlobals());

const discovery = {
  version: REVIEW_DESKTOP_DISCOVERY_VERSION,
  instanceId: "instance",
  url: "http://127.0.0.1:5570",
  appPid: 1,
  serverPid: 2,
  startedAt: 1,
  token: "private-token",
} as const;

test("rejects foreign origins before attaching credentials and disables redirects", async () => {
  const fetcher = vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("ok"),
  );

  vi.stubGlobal("fetch", fetcher);
  const request = createAuthenticatedRequest(discovery);
  await expect(request("https://foreign.example/steal")).rejects.toThrow(
    /origin/,
  );
  expect(fetcher).not.toHaveBeenCalled();
  const abort = new AbortController();

  const response = await request(discovery.url + "/health", {
    signal: abort.signal,
  });

  expect(response).toBeInstanceOf(Response);
  const init = fetcher.mock.calls[0]![1] as RequestInit;
  expect(new Headers(init.headers).get("x-review-token")).toBe("private-token");
  expect(init.redirect).toBe("error");
  const effective = new Request(fetcher.mock.calls[0]![0], init);
  abort.abort();
  expect(effective.signal.aborted).toBe(true);
});

test("pinned renamed source retains its side and line identity", async () => {
  const urls: URL[] = [];

  const transport = async (url: string) => {
    urls.push(new URL(url));

    return Response.json({
      rootPath: "/tmp/pinned",
      filePath: "/tmp/old π.ts",
    });
  };

  const api = new ReviewApiClient(
    { serverUrl: discovery.url, token: discovery.token },
    transport,
  );

  const open = vi.fn<() => Promise<void>>(async () => {});

  const view = {
    reviewId: "r",
    version: 7,
    pins: { repositoryId: "repo", base: "a".repeat(40), head: "b".repeat(40) },
  };

  await openSourceFile(
    api,
    open,
    { view, file: "old π.ts", side: "base" },
    { startLine: 42, endLine: 43 },
  );
  expect(urls[0]!.searchParams.get("base")).toBe(view.pins.base);
  expect(urls[0]!.searchParams.get("side")).toBe("base");
  expect(urls[0]!.searchParams.get("file")).toBe("old π.ts");
  expect(open).toHaveBeenCalledWith({
    kind: "file",
    rootPath: "/tmp/pinned",
    filePath: "/tmp/old π.ts",
    range: { startLine: 42, endLine: 43 },
  });
});

test.each(["renamed", "added", "deleted"])(
  "diff navigation resolves %s sides from the pinned manifest",
  async (status) => {
    const queries: URL[] = [];

    const transport = async (url: string) => {
      const parsed = new URL(url);

      if (parsed.pathname.endsWith("/diff")) {
        readQuerySchemas.diff.parse(Object.fromEntries(parsed.searchParams));

        return Response.json([
          {
            path: "new.ts",
            previousPath: status === "renamed" ? "old.ts" : undefined,
            status,
          },
        ]);
      }

      queries.push(parsed);

      return Response.json({
        rootPath: "/tmp/w",
        filePath:
          parsed.searchParams.get("empty") === "true"
            ? "/tmp/empty"
            : `/tmp/${parsed.searchParams.get("file")}`,
      });
    };

    const api = new ReviewApiClient(
      { serverUrl: discovery.url, token: discovery.token },
      transport,
    );

    const open = vi.fn<() => Promise<void>>(async () => {});
    await openSourceDiff(api, open, { reviewId: "r", version: 2 }, "new.ts");
    expect(
      queries
        .find((q) => q.searchParams.get("side") === "base")!
        .searchParams.get("file"),
    ).toBe(status === "renamed" ? "old.ts" : "new.ts");

    expect(
      queries
        .find((q) => q.searchParams.get("side") === "base")!
        .searchParams.get("empty"),
    ).toBe(status === "added" ? "true" : null);
    expect(
      queries
        .find((q) => q.searchParams.get("side") === "head")!
        .searchParams.get("empty"),
    ).toBe(status === "deleted" ? "true" : null);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "diff" }),
    );
  },
);

test("real transport preserves responses, rejects redirects and cancels live bodies", async () => {
  let closed!: () => void;

  const disconnected = new Promise<void>((resolve) => {
    closed = resolve;
  });

  const tokens: string[] = [];

  const server = createServer((req, res) => {
    tokens.push(String(req.headers["x-review-token"]));

    if (req.url === "/redirect") {
      res.writeHead(302, { location: "https://foreign.example/" });
      res.end();

      return;
    }

    if (req.url === "/stream") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("first\n");
      req.on("close", closed);

      return;
    }

    res.writeHead(409, { "x-probe": "retained" });
    res.end("busy");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;

  try {
    const request = createAuthenticatedRequest({ ...discovery, url });
    const response = await request(url + "/status");
    expect(response.status).toBe(409);
    expect(response.headers.get("x-probe")).toBe("retained");
    expect(await response.text()).toBe("busy");
    await expect(request(url + "/redirect")).rejects.toThrow(Error);
    const abort = new AbortController();

    const stream = (await request(url + "/stream", { signal: abort.signal }))
      .body!;

    const reader = stream.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(
      "first\n",
    );
    abort.abort();
    await disconnected;
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    expect(tokens).toEqual(["private-token", "private-token", "private-token"]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("control pairs frame IDs with truthful dispatch failures", async () => {
  const abort = new AbortController();
  const replies: unknown[] = [];

  const frame = {
    event: "desktop-verb",
    id: "frame-1",
    request: { name: "authoringCapabilities", args: {} },
  };

  const request = async (url: string, init?: RequestInit) => {
    if (url.endsWith("/result")) {
      replies.push(JSON.parse(String(init?.body)));
      abort.abort();

      return new Response(null, { status: 204 });
    }

    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`),
          );
        },
      }),
    );
  };

  await connectControl(
    request,
    async () => {
      throw new Error("launch failed");
    },
    discovery.url,
    abort.signal,
  );
  expect(replies).toEqual([
    { id: "frame-1", response: { ok: false, error: "launch failed" } },
  ]);
});

test.each(["malformed", "ack"])(
  "control surfaces %s failures and unlocks its reader",
  async (kind) => {
    const frame =
      kind === "malformed"
        ? { event: "wrong" }
        : {
            event: "desktop-verb",
            id: "1",
            request: { name: "authoringCapabilities", args: {} },
          };

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`),
        );
        c.close();
      },
    });

    const request = async (url: string) =>
      url.endsWith("/result")
        ? new Response(null, { status: 500 })
        : new Response(stream);

    await expect(
      connectControl(
        request,
        async () => ({ ok: true }),
        discovery.url,
        new AbortController().signal,
      ),
    ).rejects.toThrow(Error);
    expect(stream.locked).toBe(false);
  },
);

test("navigator failure never launches an unpinned local substitute", async () => {
  const api = new ReviewApiClient(
    { serverUrl: discovery.url, token: discovery.token },
    async () =>
      Response.json({ error: "Pinned bytes missing" }, { status: 404 }),
  );

  const open = vi.fn<() => Promise<void>>(async () => {});
  await expect(
    openSourceFile(api, open, {
      view: { reviewId: "r", version: 2 },
      file: "missing.ts",
      side: "head",
    }),
  ).rejects.toThrow("Pinned bytes missing");
  expect(open).not.toHaveBeenCalled();
});

test("theme and layout subscribers ignore unrelated tab preferences", async () => {
  let preferences = { ...defaultPreferences };
  let theme: "dark" | "light" = "dark";
  const listeners = new Set<() => void>();

  const bridge = createCanvasBridge({
    state: { status: "ready", discovery, preferences },
    reviewId: "r",
    wasmUrl: "https://example.test/libavoid.wasm",
    request: async (url) => {
      readQuerySchemas.diff.parse(
        Object.fromEntries(new URL(url).searchParams),
      );

      return Response.json([]);
    },
    post: async () => ({ ok: true }),
    view: () => ({ reviewId: "r", version: 0 }),
    theme: () => theme,
    notify: () => {},
    preferences: {
      current: () => preferences,
      set: async () => {},
      subscribe: (listener) => {
        listeners.add(listener);

        return {
          dispose: () => {
            listeners.delete(listener);
          },
        };
      },
    },
  });

  expect(await bridge.diffView.files()).toEqual([]);
  expect(bridge.defaultDiffMode).toBe("text");
  preferences = { ...preferences, defaultDiffMode: "structural" };
  expect(bridge.defaultDiffMode).toBe("structural");

  const themes: string[] = [],
    layouts: string[] = [];

  const a = bridge.onDidChangeTheme((value) => themes.push(value)),
    b = bridge.onDidChangeDiffLayout((value) => layouts.push(value));

  preferences = { ...preferences, reviewIds: ["r"] };

  for (const listener of listeners) listener();
  expect(themes).toEqual([]);
  expect(layouts).toEqual([]);
  preferences = { ...preferences, diffLayout: "unified" };

  for (const listener of listeners) listener();
  expect(layouts).toEqual(["unified"]);
  theme = "light";

  for (const listener of listeners) listener();
  expect(themes).toEqual(["light"]);
  a.dispose();
  b.dispose();
  expect(listeners.size).toBe(0);
});
