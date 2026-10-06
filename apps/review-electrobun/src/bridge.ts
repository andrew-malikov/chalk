import {
  ReviewApiClient,
  ReviewDesktopVerbFrameSchema,
  ReviewRuntimeConfigSchema,
  ReviewVerbRequestSchema,
  ReviewVerbResponseSchema,
  consumeReviewEventStream,
  reviewSourceComparison,
  reviewSourceQuery,
} from "@dev.fast/review-protocol";
import type {
  ReviewApiSourceLocation,
  ReviewCanvasBridge,
  ReviewDesktopDiscovery,
  ReviewDiffFileWire,
  ReviewDisposable,
  ReviewInlineEditorRange,
  ReviewSourceView,
  ReviewSurfaceEvent,
  ReviewTheme,
  ReviewVerbResponse,
} from "@dev.fast/review-protocol";

import type { HostState, NativeOpenRequest, ShellPreferences } from "./rpc";

export function createAuthenticatedRequest(
  discovery: ReviewDesktopDiscovery,
  sessionId?: string,
): ReviewCanvasBridge["request"] {
  const origin = new URL(discovery.url).origin;

  return async (input, init) => {
    const url = new URL(input, origin);

    if (url.origin !== origin)
      throw new Error("Refusing to send review credentials to another origin.");
    const headers = new Headers(init?.headers);
    headers.set("x-review-token", discovery.token);

    if (sessionId) headers.set("x-review-app-session-id", sessionId);

    return fetch(url, { ...init, headers, redirect: "error" });
  };
}

function query(
  view: ReviewSourceView,
  values: Record<string, string | number | boolean | undefined> = {},
) {
  const result = new URLSearchParams();

  for (const [key, value] of Object.entries({
    ...reviewSourceQuery(view),
    ...values,
  }))
    if (key !== "reviewId" && value !== undefined)
      result.set(key, String(value));

  return result;
}

async function navigator(
  api: ReviewApiClient,
  view: ReviewSourceView,
  values: Record<string, string | boolean | undefined> = {},
) {
  return api.post<{ workspacePath: string; filePath?: string }>(
    `/${encodeURIComponent(view.reviewId)}/navigator?${query(view, values)}`,
    {},
    AbortSignal.timeout(60_000),
  );
}

export async function openSourceWorkspace(
  api: ReviewApiClient,
  open: (request: NativeOpenRequest) => Promise<void>,
  view: ReviewSourceView,
) {
  const destination = await navigator(api, view);
  await open({ kind: "workspace", workspacePath: destination.workspacePath });
}

export async function openSourceFile(
  api: ReviewApiClient,
  open: (request: NativeOpenRequest) => Promise<void>,
  source: ReviewApiSourceLocation,
  range?: ReviewInlineEditorRange,
) {
  const destination = await navigator(api, source.view, {
    file: source.file,
    side: source.side,
  });

  if (!destination.filePath)
    throw new Error("Pinned source file is unavailable.");
  await open({
    kind: "file",
    workspacePath: destination.workspacePath,
    filePath: destination.filePath,
    range,
  });
}

export async function openSourceDiff(
  api: ReviewApiClient,
  open: (request: NativeOpenRequest) => Promise<void>,
  view: ReviewSourceView,
  path: string,
) {
  const manifest = await api.read<ReviewDiffFileWire[]>(
    `/${encodeURIComponent(view.reviewId)}/diff?${query(view)}`,
  );

  const file = manifest.find(
    (file) => file.path === path || file.previousPath === path,
  );

  if (!file) throw new Error("Diff file is unavailable.");

  const [base, head] = await Promise.all([
    navigator(api, view, {
      file: file.previousPath ?? file.path,
      side: "base",
      empty: file.status === "added" ? true : undefined,
    }),
    navigator(api, view, {
      file: file.path,
      side: "head",
      empty: file.status === "deleted" ? true : undefined,
    }),
  ]);

  if (!base.filePath || !head.filePath)
    throw new Error("Pinned diff source is unavailable.");
  await open({
    kind: "diff",
    workspacePath: head.workspacePath,
    originalPath: base.filePath,
    modifiedPath: head.filePath,
  });
}

export async function connectControl(
  request: ReviewCanvasBridge["request"],
  dispatch: ReviewCanvasBridge["post"],
  serverUrl: string,
  signal: AbortSignal,
  onConnected?: () => void,
) {
  const response = await request(`${serverUrl}/control`, { signal });

  if (!response.ok || !response.body)
    throw new Error(`Cannot attach desktop control (${response.status}).`);
  onConnected?.();
  await consumeReviewEventStream(
    response.body,
    async (value) => {
      const frame = ReviewDesktopVerbFrameSchema.parse(value);
      let result: ReviewVerbResponse;

      try {
        result = ReviewVerbResponseSchema.parse(
          await dispatch(ReviewVerbRequestSchema.parse(frame.request)),
        );
      } catch (error) {
        result = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const ack = await request(`${serverUrl}/control/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: frame.id, response: result }),
        signal,
      });

      if (!ack.ok)
        throw new Error(
          `Desktop control acknowledgement failed (${ack.status}).`,
        );
    },
    signal,
  );

  if (!signal.aborted) throw new Error("Desktop control disconnected.");
}

export interface CanvasBridgeOptions {
  state: Extract<HostState, { status: "ready" }>;
  reviewId: string;
  wasmUrl: string;
  request: ReviewCanvasBridge["request"];
  post: ReviewCanvasBridge["post"];
  view: () => ReviewSourceView;
  theme: () => ReviewTheme;
  preferences: {
    current(): ShellPreferences;
    subscribe(listener: () => void): ReviewDisposable;
    set(next: Partial<ShellPreferences>): Promise<void>;
  };
  notify: NonNullable<ReviewCanvasBridge["notify"]>;
}

export function createCanvasBridge(
  options: CanvasBridgeOptions,
): ReviewCanvasBridge {
  const { state, reviewId, preferences } = options;

  const api = new ReviewApiClient(
    { serverUrl: state.discovery.url, token: state.discovery.token },
    options.request,
  );

  const listeners = new Set<(event: ReviewSurfaceEvent) => void>();

  function watch<T>(read: () => T, listener: (value: T) => void) {
    let previous = read();

    return preferences.subscribe(() => {
      const next = read();

      if (next !== previous) {
        previous = next;
        listener(next);
      }
    });
  }

  return {
    appSessionId: state.appSessionId,
    config: ReviewRuntimeConfigSchema.parse({
      serverUrl: state.discovery.url,
      token: state.discovery.token,
      reviewId,
      wasmUrl: options.wasmUrl,
      appVersion: "0.2.0",
      theme: options.theme(),
      host: "desktop",
    }),
    request: options.request,
    diffView: {
      files: (scope) =>
        api.read<ReviewDiffFileWire[]>(
          `/${encodeURIComponent(reviewId)}/diff?${query(reviewSourceComparison(options.view(), scope?.commit))}`,
        ),
    },
    post: async (value) => {
      try {
        const request = ReviewVerbRequestSchema.parse(value);

        if (request.name === "showReviewView") {
          for (const listener of listeners)
            listener({ event: "showReviewView", view: request.args.view });

          return { ok: true };
        }

        return await options.post(request);
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        options.notify({ kind: "error", text });

        return { ok: false, error: text };
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    },
    currentTheme: options.theme,
    onDidChangeTheme: (listener) => watch(options.theme, listener),
    currentDiffLayout: () => preferences.current().diffLayout,
    get defaultDiffMode() {
      return preferences.current().defaultDiffMode;
    },
    setDiffLayout: (layout) => preferences.set({ diffLayout: layout }),
    onDidChangeDiffLayout: (listener) =>
      watch(() => preferences.current().diffLayout, listener),
    notify: options.notify,
    ready: () => {},
  };
}
