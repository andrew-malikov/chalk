import {
  mountReviewCanvas,
  reviewCanvasThemeClass,
} from "@canvas/desktop-entry";
import { createReviewAppSessionId } from "@canvas/tab-dwell-telemetry";
import {
  REVIEW_CANVAS_RESUME_EVENT,
  REVIEW_DISCORD_URL,
  ReviewApiClient,
  ReviewApiError,
  reviewSourceAnchor,
  reviewSourceComparison,
} from "@dev.fast/review-protocol";
import type {
  ReviewApiSummary,
  ReviewCanvasContent,
  ReviewCanvasHandle,
  ReviewCanvasUi,
  ReviewSourceView,
  ReviewVerbRequest,
  ReviewVerbResponse,
} from "@dev.fast/review-protocol";
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

import {
  connectControl,
  createAuthenticatedRequest,
  createCanvasBridge,
  openSourceDiff,
  openSourceFile,
  openSourceWorkspace,
} from "./bridge";
import { createCanvasUi } from "./canvas-ui";
import { mountExternalLinks } from "./external-links";
import type {
  AppRPCClient,
  HostState,
  ShellCommand,
  ShellPreferences,
} from "./rpc";

import "./shell.css";

type Options = {
  state: Extract<HostState, { status: "ready" }>;
  rpc: AppRPCClient;
  wasmUrl: string;
};

type CatalogMutation =
  | { type: "delete"; reviewId: string }
  | {
      type: "attention";
      reviewId: string;
      action: "view" | "dismiss" | "restore";
    };

type Tab = {
  id: string;
  title: string;
  view: ReviewSourceView;
  content: Extract<ReviewCanvasContent, { kind: "api" }>;
  handle?: ReviewCanvasHandle;
};

function Canvas({
  content,
  active,
  onHandle,
  ui,
}: {
  content: ReviewCanvasContent;
  active: boolean;
  onHandle: (handle: ReviewCanvasHandle | undefined) => void;
  ui: ReviewCanvasUi;
}) {
  const element = useRef<HTMLDivElement>(null);
  const handle = useRef<ReviewCanvasHandle>(undefined);
  useLayoutEffect(() => {
    const mounted = mountReviewCanvas(element.current!, content, ui);
    handle.current = mounted;
    onHandle(mounted);

    return () => {
      onHandle(undefined);
      handle.current = undefined;
      queueMicrotask(() => mounted.dispose());
    };
  }, []);
  useLayoutEffect(() => {
    handle.current?.update(content);
  }, [content]);
  useLayoutEffect(() => {
    if (active) {
      element.current
        ?.querySelector(".review-canvas-root")
        ?.dispatchEvent(new Event(REVIEW_CANVAS_RESUME_EVENT));
      handle.current?.focus();
    }
  }, [active]);

  return <div className="review-shell-canvas" ref={element} />;
}

export function mountElectrobunShell(container: HTMLElement, options: Options) {
  container.classList.add("review-canvas-root");
  const root = createRoot(container);
  let command: ((command: ShellCommand) => void) | undefined;
  root.render(
    <Shell
      {...options}
      register={(handler) => {
        command = handler;
      }}
    />,
  );

  return {
    command: (value: ShellCommand) => command?.(value),
    dispose: () => root.unmount(),
  };
}

function Shell(
  options: Options & {
    register: (handler: (command: ShellCommand) => void) => void;
  },
) {
  const shellElement = useRef<HTMLDivElement>(null);
  const uiRef = useRef<ReturnType<typeof createCanvasUi>>(undefined);
  const [, render] = useReducer((value) => value + 1, 0);
  const tabs = useRef(new Map<string, Tab>());
  const catalog = useRef<ReviewApiSummary[]>([]);
  const active = useRef<string | null>(null);
  const homeHandle = useRef<ReviewCanvasHandle>(undefined);
  const prefs = useRef(options.state.preferences);
  const listeners = useRef(new Set<() => void>());
  const [connected, setConnected] = useState(true);
  const connectedRef = useRef(true);
  const tutorialIds = useRef(new Set<string>());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [settings, setSettings] = useState(false);
  const media = useRef(matchMedia("(prefers-color-scheme: dark)"));

  const resources = useRef<{
    abort: AbortController;
    api: ReviewApiClient;
    request: ReturnType<typeof createAuthenticatedRequest>;
  }>(undefined);

  if (!resources.current) {
    const abort = new AbortController();

    const authenticated = createAuthenticatedRequest(
      options.state.discovery,
      options.state.appSessionId,
    );

    const request: typeof authenticated = (url, init) =>
      authenticated(url, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, abort.signal])
          : abort.signal,
      });

    resources.current = {
      abort,
      request,
      api: new ReviewApiClient(
        {
          serverUrl: options.state.discovery.url,
          token: options.state.discovery.token,
        },
        request,
      ),
    };
  }

  const { abort, api, request } = resources.current;

  const theme = () =>
    prefs.current.theme === "system"
      ? media.current.matches
        ? "dark"
        : "light"
      : prefs.current.theme;

  const notify = (message: { kind: "success" | "error"; text: string }) => {
    if (!abort.signal.aborted) setError(message.text);
  };

  const fail = (cause: unknown) =>
    notify({
      kind: "error",
      text: cause instanceof Error ? cause.message : String(cause),
    });

  const publish = () => {
    for (const listener of listeners.current) listener();
    render();
  };

  async function save(patch: Partial<ShellPreferences>) {
    prefs.current = await options.rpc.request.setPreferences(patch);

    if (!abort.signal.aborted) publish();
  }

  if (!uiRef.current)
    uiRef.current = createCanvasUi(
      () => shellElement.current!,
      {
        current: theme,
        subscribe: (listener) => {
          let previous = theme();

          const notify = () => {
            const next = theme();

            if (next !== previous) {
              previous = next;
              listener(next);
            }
          };

          listeners.current.add(notify);

          return {
            dispose: () => {
              listeners.current.delete(notify);
            },
          };
        },
      },
      fail,
    );
  const ui = uiRef.current;

  const preferenceSource = {
    current: () => prefs.current,
    subscribe: (listener: () => void) => {
      listeners.current.add(listener);

      return {
        dispose: () => {
          listeners.current.delete(listener);
        },
      };
    },
    set: save,
  };

  const persistTabs = () =>
    save({
      reviewIds: [...tabs.current.keys()],
      activeReviewId: active.current,
    }).catch(fail);

  function activate(id: string | null) {
    active.current = id;
    render();
    void persistTabs();
  }

  function close(id: string) {
    tabs.current.delete(id);
    tutorialIds.current.delete(id);

    if (active.current === id) active.current = null;
    render();
    void persistTabs();
  }

  function add(
    summary: Pick<ReviewApiSummary, "reviewId" | "title" | "version">,
  ) {
    const existing = tabs.current.get(summary.reviewId);

    if (existing) return existing;
    // SAFETY: add fills every Tab member synchronously before publishing it.
    const tab = {} as Tab;
    Object.assign(tab, {
      id: summary.reviewId,
      title: summary.title,
      view: { reviewId: summary.reviewId, version: summary.version },
    });

    const bridge = createCanvasBridge({
      state: options.state,
      reviewId: tab.id,
      wasmUrl: options.wasmUrl,
      request,
      view: () => tab.view,
      theme,
      preferences: preferenceSource,
      notify,
      post: (value) => dispatch(value, tab),
    });

    tab.content = {
      kind: "api",
      reviewId: tab.id,
      softwareMapEnabled: true,
      structuralDiffEnabled: false,
      bridge,
      setTitle: (title) => {
        tab.title = title;
        render();
      },
      setSourceView: (_selection, view) => {
        tab.view = view;
      },
      openSource: (source, range) =>
        openSourceFile(api, options.rpc.request.openSource, source, range),
    };
    bridge.reportDiagnostic = (message) =>
      options.rpc.send.diagnostic({
        level: message.level,
        message: message.message,
      });
    tabs.current.set(tab.id, tab);

    return tab;
  }

  function requireConnected() {
    if (!connectedRef.current)
      throw new Error("Review control is reconnecting. Try again shortly.");
  }

  async function command(operation: CatalogMutation) {
    requireConnected();
    await api.post("/commands", {
      commandId: createReviewAppSessionId(),
      operation,
    });
  }

  async function open(id: string, title?: string, makeActive = true) {
    if (!tabs.current.has(id)) {
      const summary =
        catalog.current.find((item) => item.reviewId === id) ??
        (await api.read<Pick<ReviewApiSummary, "title" | "version" | "origin">>(
          `/${encodeURIComponent(id)}?full=true`,
        ));

      if (summary.origin?.tutorial) tutorialIds.current.add(id);
      add({
        reviewId: id,
        title: title ?? summary.title,
        version: summary.version,
      });
    }

    if (makeActive) activate(id);
    else {
      render();
      void persistTabs();
    }

    await command({ type: "attention", reviewId: id, action: "view" });
  }

  async function dispatch(
    value: ReviewVerbRequest,
    tab = tabs.current.get(active.current ?? ""),
  ): Promise<ReviewVerbResponse> {
    try {
      requireConnected();

      switch (value.name) {
        case "authoringCapabilities":
          return { ok: true, result: { softwareMapEnabled: true } };
        case "openApiReview":
          await open(value.args.reviewId, value.args.title);
          await options.rpc.request.focusWindow();

          return { ok: true, result: { softwareMapEnabled: true } };
        case "openReview":
          await open(value.args.reviewUuid, undefined, value.args.active);
          break;
        case "focusWindow":
          await options.rpc.request.focusWindow();
          break;
        case "joinDiscord":
          await options.rpc.request.openExternal({ url: REVIEW_DISCORD_URL });
          break;
        case "showReviewView":
          if (!tab) throw new Error("Open a review first.");

          return tab.content.bridge.post(value);
        case "openSourceTree":
          if (!tab) throw new Error("Open a review first.");
          await openSourceWorkspace(
            api,
            options.rpc.request.openSource,
            tab.view,
          );
          break;
        case "openDiff":
          if (!tab) throw new Error("Open a review first.");
          await openSourceDiff(
            api,
            options.rpc.request.openSource,
            tab.view,
            value.args.path,
          );
          break;
        case "reveal":
          if (!tab) throw new Error("Open a review first.");
          await openSourceFile(
            api,
            options.rpc.request.openSource,
            {
              view: reviewSourceAnchor(
                reviewSourceComparison(tab.view, value.args.commit),
                value.args.pins,
              ),
              file: value.args.path,
              side: value.args.side ?? "head",
            },
            { startLine: value.args.startLine, endLine: value.args.endLine },
          );
          break;
        default:
          throw new Error("This desktop action is unavailable.");
      }

      return { ok: true };
    } catch (cause) {
      fail(cause);

      return {
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  function invoke(command: ShellCommand) {
    const dialog = shellElement.current?.querySelector("dialog[open]");

    if (dialog) {
      if (command === "closeTab")
        dialog.dispatchEvent(new Event("cancel", { cancelable: true }));

      return;
    }

    switch (command) {
      case "home":
        activate(null);
        break;
      case "settings":
        setSettings(true);
        break;
      case "closeTab":
        if (active.current) close(active.current);
        break;
      case "find":
        (active.current
          ? tabs.current.get(active.current)?.handle
          : homeHandle.current
        )?.showFind();
        break;
    }
  }

  options.register(invoke);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();

      const action =
        key === "f"
          ? "find"
          : key === ","
            ? "settings"
            : key === "w"
              ? "closeTab"
              : key === "h" && event.shiftKey
                ? "home"
                : undefined;

      if (action) {
        event.preventDefault();
        invoke(action);
      }
    };

    document.addEventListener("keydown", keyboard);

    return () => document.removeEventListener("keydown", keyboard);
  }, []);
  useEffect(() => {
    const element = shellElement.current;

    if (element)
      return mountExternalLinks(
        element,
        options.rpc.request.openExternal,
        fail,
      );
  }, []);
  useEffect(() => {
    let restored = false;

    const accept = async (summaries: ReviewApiSummary[]) => {
      catalog.current = summaries;

      if (!restored) {
        restored = true;

        for (const id of prefs.current.reviewIds) {
          const summary = summaries.find((item) => item.reviewId === id);

          if (summary) add(summary);
          else {
            try {
              const snapshot = await api.read<
                Pick<ReviewApiSummary, "title" | "version" | "origin">
              >(`/${encodeURIComponent(id)}?full=true`, abort.signal);

              if (snapshot.origin?.tutorial) {
                tutorialIds.current.add(id);

                if (!abort.signal.aborted)
                  add({
                    reviewId: id,
                    title: snapshot.title,
                    version: snapshot.version,
                  });
              }
            } catch (cause) {
              if (!(cause instanceof ReviewApiError && cause.status === 404))
                throw cause;
            }
          }
        }

        if (abort.signal.aborted) return;
        active.current = tabs.current.has(prefs.current.activeReviewId ?? "")
          ? prefs.current.activeReviewId
          : null;
        setLoaded(true);
        void persistTabs();
      } else {
        for (const [id] of tabs.current)
          if (
            !summaries.some((item) => item.reviewId === id) &&
            !tutorialIds.current.has(id)
          )
            close(id);
        render();
      }
    };

    void api
      .read<ReviewApiSummary[]>("?mode=textual", abort.signal)
      .then(async (values) => {
        if (!abort.signal.aborted) {
          await accept(values);

          if (abort.signal.aborted) return;
          void api.follow<ReviewApiSummary[]>(
            null,
            abort.signal,
            accept,
            fail,
            "textual",
          );
        }
      })
      .catch(fail);

    const connection = (value: boolean) => {
      if (abort.signal.aborted || connectedRef.current === value) return;
      connectedRef.current = value;
      setConnected(value);

      if (!value) ui.dispose();
    };

    const runControl = async () => {
      while (!abort.signal.aborted) {
        try {
          const health = await request(
            options.state.discovery.url + "/health",
            {
              signal: AbortSignal.any([
                abort.signal,
                AbortSignal.timeout(5000),
              ]),
            },
          );

          if (!health.ok) throw new Error("Review server disconnected.");
          const value = await health.json();

          if (value.instanceId !== options.state.discovery.instanceId)
            throw new Error("Review server identity changed.");
          await connectControl(
            request,
            (value) => dispatch(value),
            options.state.discovery.url,
            abort.signal,
            () => connection(true),
          );
        } catch {
          if (abort.signal.aborted) return;
        }

        connection(false);
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            abort.signal.removeEventListener("abort", finish);
            resolve();
          };

          const timer = setTimeout(finish, 1000);
          abort.signal.addEventListener("abort", finish, { once: true });
        });
      }
    };

    void runControl().catch(fail);
    const appearance = () => publish();
    media.current.addEventListener("change", appearance);

    return () => {
      abort.abort();
      ui.dispose();
      media.current.removeEventListener("change", appearance);
      listeners.current.clear();
    };
  }, []);

  async function openTutorial() {
    requireConnected();

    const response = await request(
      options.state.discovery.url + "/tutorial/prepare",
      { method: "POST" },
    );

    if (!response.ok) throw new Error("Cannot prepare the tutorial.");
    const result = await response.json();
    tutorialIds.current.add(result.reviewUuid);
    await open(result.reviewUuid, "Tutorial");
  }

  const home: Extract<ReviewCanvasContent, { kind: "home" }> = {
    kind: "home",
    reviews: catalog.current,
    openReview: (id) => {
      void open(id).catch(fail);
    },
    deleteReview: (id) => command({ type: "delete", reviewId: id }),
    dismissReview: (id) =>
      command({ type: "attention", reviewId: id, action: "dismiss" }),
    restoreReview: (id) =>
      command({ type: "attention", reviewId: id, action: "restore" }),
    openSourceTree: (id) => {
      const summary = catalog.current.find((item) => item.reviewId === id);

      if (summary)
        void openSourceWorkspace(api, options.rpc.request.openSource, {
          reviewId: id,
          version: summary.version,
        }).catch(fail);
    },
    openTutorial: () => {
      void openTutorial().catch(fail);
    },
  };

  const resolvedTheme = theme();
  const themeClass = reviewCanvasThemeClass(resolvedTheme);

  return (
    <div
      ref={shellElement}
      className={["review-shell", themeClass].join(" ")}
      data-theme={resolvedTheme}
    >
      <header className="review-shell-bar">
        <div
          role="tablist"
          tabIndex={-1}
          aria-label="Reviews"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();

            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "[role=tab]",
              ),
            ];

            const index = buttons.findIndex(
              (button) => button === document.activeElement,
            );

            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;

            buttons[next]?.click();
            buttons[next]?.focus();
          }}
        >
          <button
            role="tab"
            aria-label="Home"
            tabIndex={active.current === null ? 0 : -1}
            aria-selected={active.current === null}
            onClick={() => activate(null)}
          >
            Home
          </button>
          {[...tabs.current.values()].map((tab) => (
            <div className="review-shell-tab" key={tab.id}>
              <button
                role="tab"
                aria-label={tab.title}
                tabIndex={active.current === tab.id ? 0 : -1}
                aria-selected={active.current === tab.id}
                onClick={() => activate(tab.id)}
              >
                {tab.title}
              </button>
              <button
                aria-label={`Close ${tab.title}`}
                onClick={() => close(tab.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {active.current === null && (
          <button
            aria-label="Open tutorial"
            disabled={!connected}
            onClick={home.openTutorial}
          >
            Tutorial
          </button>
        )}
        <button aria-label="Settings" onClick={() => setSettings(true)}>
          Settings
        </button>
      </header>
      {!connected && (
        <div className="review-shell-notice" role="status">
          Reconnecting to review server…
        </div>
      )}
      {error && (
        <div className="review-shell-notice" role="alert">
          {error}
          <button
            aria-label="Dismiss notification"
            onClick={() => setError(undefined)}
          >
            ×
          </button>
        </div>
      )}
      {!loaded ? (
        <main className="review-shell-loading">
          {error
            ? "Unable to load reviews. Close and reopen Review to retry."
            : "Loading reviews…"}
        </main>
      ) : (
        <>
          <section
            inert={!connected}
            role="tabpanel"
            aria-label="Home"
            hidden={active.current !== null}
          >
            <Canvas
              ui={ui}
              content={home}
              active={active.current === null}
              onHandle={(handle) => {
                homeHandle.current = handle;
              }}
            />
          </section>
          {[...tabs.current.values()].map((tab) => (
            <section
              inert={!connected}
              role="tabpanel"
              aria-label={tab.title}
              key={tab.id}
              hidden={active.current !== tab.id}
            >
              <Canvas
                ui={ui}
                content={tab.content}
                active={active.current === tab.id}
                onHandle={(handle) => {
                  tab.handle = handle;
                }}
              />
            </section>
          ))}
        </>
      )}
      {settings && (
        <SettingsDialog
          preferences={prefs.current}
          save={(patch) => {
            void save(patch).catch(fail);
          }}
          close={() => setSettings(false)}
        />
      )}
    </div>
  );
}

function SettingsDialog({
  preferences,
  save,
  close,
}: {
  preferences: ShellPreferences;
  save: (patch: Partial<ShellPreferences>) => void;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current!;
    dialog.showModal();

    return () => {
      dialog.close();

      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="review-shell-dialog"
      role="dialog"
      aria-label="Settings"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2>Settings</h2>
      <label>
        Appearance
        <select
          value={preferences.theme}
          onChange={(event) => {
            // SAFETY: the select options are authored from the theme enum below.
            void save({
              theme: event.target.value as ShellPreferences["theme"],
            });
          }}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label>
        Diff layout
        <select
          value={preferences.diffLayout}
          onChange={(event) => {
            // SAFETY: the select options below contain only supported layouts.
            void save({
              diffLayout: event.target.value as ShellPreferences["diffLayout"],
            });
          }}
        >
          <option value="split">Split</option>
          <option value="unified">Unified</option>
        </select>
      </label>
      <button onClick={close}>Done</button>
    </dialog>
  );
}
