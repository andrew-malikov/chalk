import { Button } from "@canvas/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@canvas/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canvas/components/ui/dialog";
import { NativeSelect } from "@canvas/components/ui/native-select";
import {
  mountReviewCanvas,
  reviewCanvasThemeClass,
} from "@canvas/desktop-entry";
import {
  REVIEW_CANVAS_RESUME_EVENT,
  ReviewApiClient,
  ReviewApiError,
  parseReviewCliInstallStatus,
  reviewSourceAnchor,
  reviewSourceComparison,
} from "@chalk/review-contracts";
import type {
  ReviewApiSummary,
  ReviewCanvasChrome,
  ReviewCanvasContent,
  ReviewCanvasHandle,
  ReviewCanvasInstallContent,
  ReviewCanvasTutorialBridge,
  ReviewCanvasUi,
  ReviewSourceView,
  ReviewVerbRequest,
  ReviewVerbResponse,
  TutorialProgressV1,
} from "@chalk/review-contracts";
import { fuzzyMatches } from "@review/lib/fuzzy-match";
import {
  BookOpenIcon,
  ChevronDownIcon,
  FileTextIcon,
  SearchIcon,
  Settings2Icon,
  SquareArrowOutUpRightIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
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
  openSourceDirectory,
  openSourceFile,
} from "./bridge";
import { createCanvasUi } from "./canvas-ui";
import { createDoubleShift } from "./double-shift";
import { mountExternalLinks } from "./external-links";
import type {
  AppRPCClient,
  HostState,
  ShellCommand,
  ShellPreferences,
} from "./rpc";

type Options = {
  state: Extract<HostState, { status: "ready" }>;
  rpc: AppRPCClient;
  wasmUrl: string;
  nativeTitlebar?: boolean;
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
  // The canvas portals its tabs and actions here; the titlebar shows the
  // active tab's.
  chrome: ReviewCanvasChrome;
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

  return (
    <div
      className="review-shell-canvas tw:h-full tw:min-h-0 tw:min-w-0 tw:flex-1"
      ref={element}
    />
  );
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
  const viewsHost = useRef<HTMLDivElement>(null);
  const actionsHost = useRef<HTMLDivElement>(null);
  const uiRef = useRef<ReturnType<typeof createCanvasUi>>(undefined);
  const [, render] = useReducer((value) => value + 1, 0);
  const tabs = useRef(new Map<string, Tab>());
  const catalog = useRef<ReviewApiSummary[]>([]);
  const active = useRef<string | null>(null);
  const prefs = useRef(options.state.preferences);
  const tutorialProgress = useRef(options.state.preferences.tutorialProgress);
  const listeners = useRef(new Set<() => void>());
  const [connected, setConnected] = useState(true);
  const connectedRef = useRef(true);
  const tutorialIds = useRef(new Set<string>());
  const [loaded, setLoaded] = useState(false);
  const [install, setInstall] = useState<ReviewCanvasInstallContent>();
  const [error, setError] = useState<string>();
  const [settings, setSettings] = useState(false);
  const [setup, setSetup] = useState(false);
  const [palette, setPalette] = useState(false);
  const media = useRef(matchMedia("(prefers-color-scheme: dark)"));

  const resources = useRef<{
    abort: AbortController;
    api: ReviewApiClient;
    request: ReturnType<typeof createAuthenticatedRequest>;
  }>(undefined);

  if (!resources.current) {
    const abort = new AbortController();

    const authenticated = createAuthenticatedRequest(options.state.discovery);

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

  async function loadInstall(): Promise<ReviewCanvasInstallContent> {
    const response = await request(
      options.state.discovery.url + "/install/status",
    );

    if (!response.ok) throw new Error("Cannot load Chalk command setup.");
    const status = parseReviewCliInstallStatus(await response.json());

    const mutate = async (path: string, body = {}) => {
      requireConnected();

      const response = await request(
        options.state.discovery.url + "/install/" + path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const result = await response.json().catch(() => undefined);
        throw new Error(
          result?.output ?? result?.error ?? "Chalk command setup failed.",
        );
      }

      return (await loadInstall()).status;
    };

    const content: ReviewCanvasInstallContent = {
      status,
      apply: (body) => mutate("apply", body),
      remove: (body) => mutate("remove", body),
      finishUpdate: () => mutate("finish-update"),
      decline: () => mutate("decline"),
      skip: () => mutate("skip"),
      enablePrompts: async () => (await loadInstall()).status,
    };

    if (!abort.signal.aborted) setInstall(content);

    return content;
  }

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
    for (const id of tutorialIds.current) {
      const tab = tabs.current.get(id);

      if (tab) tab.content = { ...tab.content, tutorial: tutorialBridge(id) };
    }

    for (const listener of listeners.current) listener();
    render();
  };

  async function save(patch: Partial<ShellPreferences>) {
    prefs.current = await options.rpc.request.setPreferences(patch);

    if (!abort.signal.aborted) publish();
  }

  function updateTutorial(progress: TutorialProgressV1) {
    const previous = tutorialProgress.current;
    tutorialProgress.current = progress;
    publish();
    void save({ tutorialProgress: progress }).catch((cause) => {
      if (tutorialProgress.current === progress) {
        tutorialProgress.current = previous;
        publish();
      }

      fail(cause);
    });
  }

  function tutorialBridge(id: string): ReviewCanvasTutorialBridge {
    return {
      content: {
        reviewUuid: id,
        progress: tutorialProgress.current,
        keymap: prefs.current.keymap,
      },
      setStep: (step, checked) => {
        const progress = tutorialProgress.current;
        const steps = new Set(progress.checked);

        if (checked) steps.add(step);
        else steps.delete(step);
        updateTutorial({ ...progress, checked: [...steps] });
      },
      dismiss: () =>
        updateTutorial({ ...tutorialProgress.current, dismissed: true }),
      reopen: () =>
        updateTutorial({ ...tutorialProgress.current, dismissed: false }),
      selectKeymap: async (keymap) => {
        try {
          await save({ keymap });
          tutorialBridge(id).setStep("chooseKeymap", true);
        } catch (cause) {
          fail(cause);
        }
      },
      close: () => close(id),
    };
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

    if (active.current === id) {
      active.current = [...tabs.current.keys()].at(-1) ?? null;
    }

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
      chrome: {
        views: document.createElement("div"),
        actions: document.createElement("div"),
        // add runs from effects and async loads, after the shell mounts.
        overlay: shellElement.current!,
        deleteReview: async () => {
          if (await ui.confirmDelete?.(tab.title))
            await command({ type: "delete", reviewId: tab.id });
        },
      },
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
      tutorial: tutorialIds.current.has(tab.id)
        ? tutorialBridge(tab.id)
        : undefined,
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
      chrome: tab.chrome,
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
      commandId: crypto.randomUUID(),
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
        case "showReviewView":
          if (!tab) throw new Error("Open a review first.");

          return tab.content.bridge.post(value);
        case "openSourceTree":
          if (!tab) throw new Error("Open a review first.");
          await openSourceDirectory(
            api,
            options.rpc.request.openSource,
            tab.view,
            value.args.app,
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

    if (shellElement.current?.querySelector('[data-slot="dialog-content"]')) {
      if (command === "closeTab") {
        setSettings(false);
        setSetup(false);
        setPalette(false);
      }

      return;
    }

    switch (command) {
      case "commandPalette":
        setPalette(true);
        break;
      case "settings":
        setSettings(true);
        break;
      case "closeTab":
        if (active.current) close(active.current);
        break;
      case "find":
        // In-review find is disabled until it works; ⌘F only searches reviews from Home.
        if (active.current) break;
        setPalette(true);
        break;
    }
  }

  options.register(invoke);
  useEffect(() => {
    const doubleShift = createDoubleShift();

    const keyboard = (event: KeyboardEvent) => {
      if (doubleShift(event)) invoke("commandPalette");

      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();

      const action =
        key === "f"
          ? "find"
          : key === ","
            ? "settings"
            : key === "w"
              ? "closeTab"
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
      const previous = catalog.current;
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
          : ([...tabs.current.keys()].at(-1) ??
            summaries.find((review) => !review.dismissedAt)?.reviewId ??
            null);

        const initial = summaries.find(
          (review) => review.reviewId === active.current,
        );

        if (initial) add(initial);
        setLoaded(true);
        void persistTabs();
      } else {
        let settledActive = false;

        for (const [id] of tabs.current) {
          const summary = summaries.find((item) => item.reviewId === id);

          if (!summary && !tutorialIds.current.has(id)) close(id);
          // Settling puts a review away; the palette's Settled group restores it.
          else if (
            summary?.dismissedAt &&
            !previous.find((item) => item.reviewId === id)?.dismissedAt
          ) {
            settledActive ||= active.current === id;
            close(id);
          }
        }

        const next = summaries.find((review) => !review.dismissedAt);

        if (settledActive && !active.current && next)
          void open(next.reviewId).catch(fail);
        render();
      }
    };

    void loadInstall().catch(fail);

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
    updateTutorial({ ...tutorialProgress.current, dismissed: false });
    await open(result.reviewUuid, "Tutorial");
  }

  function openInMenu(anchor: HTMLElement) {
    ui.showMenu({
      anchor,
      items: [
        { id: "vscode", label: "VS Code" },
        { id: "zed", label: "Zed" },
        { id: "finder", label: "Finder" },
      ],
      onHide() {},
      onSelect: async (app) => {
        await dispatch({
          name: "openSourceTree",
          args: app === "zed" || app === "finder" ? { app } : {},
        });
      },
    });
  }

  const reviews = catalog.current.map((review) => ({
    id: review.reviewId,
    title:
      tabs.current.get(review.reviewId)?.title ||
      review.title ||
      "Untitled review",
    repository: review.repositoryName,
    dismissed: !!review.dismissedAt,
  }));

  for (const tab of tabs.current.values()) {
    if (!reviews.some((review) => review.id === tab.id))
      reviews.push({
        id: tab.id,
        title: tab.title,
        repository: "Tutorial",
        dismissed: false,
      });
  }

  const reviewItems = (dismissed: boolean) =>
    reviews
      .filter((review) => review.dismissed === dismissed)
      .map((review) => (
        <CommandItem
          key={review.id}
          value={review.id}
          keywords={[review.title, review.repository]}
          disabled={!connected}
          onSelect={() => {
            setPalette(false);
            void (async () => {
              if (review.dismissed)
                await command({
                  type: "attention",
                  reviewId: review.id,
                  action: "restore",
                });
              await open(review.id);
            })().catch(fail);
          }}
        >
          <FileTextIcon aria-hidden="true" />
          <span className="review-shell-review-label tw:flex tw:min-w-0 tw:flex-col tw:gap-1 tw:text-left tw:text-xs tw:[&_span]:truncate">
            <span title={review.title}>{review.title}</span>
            <span className="review-shell-review-repository tw:text-[11px] tw:text-[var(--ink-faint)]">
              {review.repository}
            </span>
          </span>
        </CommandItem>
      ));

  const resolvedTheme = theme();
  const themeClass = reviewCanvasThemeClass(resolvedTheme);
  const currentTab = tabs.current.get(active.current ?? "");

  const currentReview = catalog.current.find(
    (review) => review.reviewId === active.current,
  );

  useLayoutEffect(() => {
    viewsHost.current?.replaceChildren(
      ...(currentTab ? [currentTab.chrome.views] : []),
    );
    actionsHost.current?.replaceChildren(
      ...(currentTab ? [currentTab.chrome.actions] : []),
    );
  }, [currentTab]);

  return (
    <div
      ref={shellElement}
      className={[
        "review-shell tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:[--titlebar-bg:var(--tray)] tw:dark:[--titlebar-bg:#0c0c0c] tw:bg-background tw:text-foreground tw:font-[family-name:var(--chrome-font)] tw:text-sm tw:antialiased",
        themeClass,
      ].join(" ")}
      data-theme={resolvedTheme}
    >
      <header
        className="review-shell-titlebar electrobun-webkit-app-region-drag tw:grid tw:h-14 tw:flex-none tw:grid-cols-[1fr_minmax(0,44rem)_1fr] tw:items-center tw:gap-4 tw:bg-[var(--titlebar-bg)] tw:px-4 tw:select-none tw:[-webkit-app-region:drag] tw:data-[native-titlebar]:pl-[88px] tw:[&_button]:[-webkit-app-region:no-drag] tw:max-[760px]:gap-2 tw:max-[760px]:pr-2"
        data-native-titlebar={options.nativeTitlebar || undefined}
      >
        <div className="review-shell-context tw:col-start-2 tw:flex tw:h-8 tw:min-w-0 tw:items-center tw:rounded-md tw:bg-background tw:dark:bg-input/30">
          <Button
            variant="ghost"
            size="sm"
            className="tw:min-w-0 tw:flex-1 tw:justify-start tw:rounded-r-none tw:font-normal tw:text-muted-foreground"
            aria-label="Search reviews"
            title="Search reviews (⇧⇧)"
            onClick={() => setPalette(true)}
          >
            <SearchIcon aria-hidden="true" />
            {currentTab && (
              <>
                <span
                  className="review-shell-repository tw:max-w-[180px] tw:truncate tw:max-[760px]:max-w-24 tw:max-[480px]:hidden"
                  title={currentReview?.repositoryName}
                >
                  {currentReview?.repositoryName || "Reviews"}
                </span>
                <span
                  className="review-shell-context-separator tw:text-[var(--ink-faint)] tw:max-[480px]:hidden"
                  aria-hidden="true"
                >
                  /
                </span>
              </>
            )}
            <span
              className="review-shell-current-title tw:truncate tw:text-foreground"
              title={currentTab?.title || "Chalk"}
            >
              {currentTab?.title || "Chalk"}
            </span>
          </Button>
          <div
            ref={viewsHost}
            className="review-shell-views tw:flex tw:flex-none tw:items-center tw:border-l tw:px-3 tw:empty:hidden tw:dark:border-input"
          />
        </div>
        <div className="review-shell-actions tw:flex tw:items-center tw:justify-self-end tw:gap-1 tw:text-muted-foreground">
          {currentTab && (
            <div className="review-shell-editor tw:mr-2 tw:flex tw:max-[760px]:mr-0">
              <Button
                variant="ghost"
                size="icon-sm"
                className="tw:rounded-r-none"
                aria-label="Open in VS Code"
                title="Open review source in VS Code"
                disabled={!connected}
                onClick={() =>
                  void dispatch({ name: "openSourceTree", args: {} })
                }
              >
                <SquareArrowOutUpRightIcon aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="tw:w-7 tw:rounded-l-none"
                aria-label="Open in…"
                disabled={!connected}
                onClick={(event) => openInMenu(event.currentTarget)}
              >
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            </div>
          )}
          <div ref={actionsHost} className="tw:flex tw:empty:hidden" />
        </div>
      </header>
      <div className="review-shell-notices tw:fixed tw:right-[18px] tw:bottom-[18px] tw:z-[10001] tw:flex tw:max-w-[380px] tw:flex-col tw:gap-2">
        {!connected && (
          <div
            className="review-shell-notice tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded-[10px] tw:border tw:border-border tw:bg-[var(--tray)] tw:px-3 tw:py-2 tw:shadow-[0_8px_24px_var(--shadow-color-strong)]"
            role="status"
          >
            Reconnecting to review server…
          </div>
        )}
        {error && (
          <div
            className="review-shell-notice tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded-[10px] tw:border tw:border-border tw:bg-[var(--tray)] tw:px-3 tw:py-2 tw:shadow-[0_8px_24px_var(--shadow-color-strong)]"
            role="alert"
          >
            {error}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss notification"
              onClick={() => setError(undefined)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
      <div className="review-shell-body tw:relative tw:flex tw:min-h-0 tw:flex-1">
        <main
          className="review-shell-content tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:bg-[var(--titlebar-bg)]"
          inert={!connected}
        >
          {!loaded ? (
            <div className="review-shell-loading tw:p-8" role="status">
              {error
                ? "Unable to load reviews. Close and reopen Chalk to retry."
                : "Loading reviews…"}
            </div>
          ) : !currentTab ? (
            <div className="review-shell-empty tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:p-8 tw:text-center tw:text-muted-foreground tw:[&>svg]:size-8 tw:[&_h1]:mt-4 tw:[&_h1]:text-lg tw:[&_h1]:text-foreground tw:[&_p]:mb-6 tw:[&_p]:max-w-[360px] tw:[&_p]:text-[13px] tw:[&_p]:leading-[1.6]">
              <FileTextIcon aria-hidden="true" />
              <h1>
                {reviews.length
                  ? "Select a review"
                  : "Your reviews appear here"}
              </h1>
              <p>
                {reviews.length
                  ? "Press Shift twice to search your reviews."
                  : "Publish a review from your agent, or open the tutorial to get started."}
              </p>
              <Button variant="outline" onClick={() => setPalette(true)}>
                Browse reviews
              </Button>
            </div>
          ) : null}
          {[...tabs.current.values()].map((tab) => (
            <section
              className="review-shell-review-panel tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:rounded-t-[10px] tw:[&[hidden]]:hidden"
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
        </main>
      </div>
      {setup && (
        <Dialog open onOpenChange={setSetup}>
          <DialogContent
            container={shellElement.current}
            className="review-shell-setup tw:flex tw:h-[min(720px,calc(100%-64px))] tw:w-[min(860px,calc(100%-32px))] tw:max-w-[860px] tw:flex-col tw:overflow-hidden"
          >
            <DialogHeader>
              <DialogTitle>Command setup</DialogTitle>
              <DialogDescription>
                Connect Chalk to your coding agent.
              </DialogDescription>
            </DialogHeader>
            <Canvas
              ui={ui}
              active
              onHandle={() => {}}
              content={{
                kind: "welcome",
                install,
                setupActions: {
                  load: loadInstall,
                  installCli: async () => {
                    const current = await loadInstall();
                    await current.apply({ shim: true });
                  },
                },
                openTutorial: () => {
                  setSetup(false);
                  void openTutorial().catch(fail);
                },
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      <CommandDialog
        container={shellElement.current}
        title="Command palette"
        description="Search reviews and run Chalk commands."
        open={palette}
        onOpenChange={setPalette}
        filter={(_value, search, keywords = []) =>
          fuzzyMatches(search, ...keywords) ? 1 : 0
        }
      >
        <CommandInput placeholder="Search reviews…" />
        <CommandList>
          <CommandEmpty>
            {loaded ? "No matching reviews." : "Loading reviews…"}
          </CommandEmpty>
          <CommandGroup heading="Reviews">{reviewItems(false)}</CommandGroup>
          <CommandGroup heading="Settled">{reviewItems(true)}</CommandGroup>
          <CommandGroup heading="Chalk">
            <CommandItem
              keywords={["Tutorial"]}
              disabled={!connected}
              onSelect={() => {
                setPalette(false);
                void openTutorial().catch(fail);
              }}
            >
              <BookOpenIcon aria-hidden="true" /> Tutorial
            </CommandItem>
            <CommandItem
              keywords={["Command setup"]}
              disabled={!connected}
              onSelect={() => {
                setPalette(false);
                setSetup(true);
              }}
            >
              <TerminalIcon aria-hidden="true" /> Command setup
            </CommandItem>
            <CommandItem
              keywords={["Settings"]}
              onSelect={() => {
                setPalette(false);
                setSettings(true);
              }}
            >
              <Settings2Icon aria-hidden="true" /> Settings
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      {settings && (
        <SettingsDialog
          container={shellElement.current}
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
  container,
  preferences,
  save,
  close,
}: {
  container: HTMLElement | null;
  preferences: ShellPreferences;
  save: (patch: Partial<ShellPreferences>) => void;
  close: () => void;
}) {
  const previousFocus = useRef(document.activeElement);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        container={container}
        className="review-shell-settings tw:max-w-[min(420px,calc(100%-32px))] tw:font-[family-name:var(--chrome-font)] tw:text-sm"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const previous = previousFocus.current;

          if (previous instanceof HTMLElement && previous.isConnected)
            previous.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Make Chalk feel at home.</DialogDescription>
        </DialogHeader>
        <div className="review-shell-settings-fields tw:grid tw:gap-4 tw:py-3 tw:[&_label]:flex tw:[&_label]:items-center tw:[&_label]:justify-between tw:[&_label]:gap-4 tw:[&_select]:min-w-[132px]">
          <label htmlFor="shell-appearance">
            <span>Appearance</span>
            <NativeSelect
              id="shell-appearance"
              aria-label="Appearance"
              value={preferences.theme}
              onChange={(event) => {
                // SAFETY: the options below contain only supported themes.
                save({
                  theme: event.target.value as ShellPreferences["theme"],
                });
              }}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </NativeSelect>
          </label>
        </div>
        <DialogFooter>
          <Button onClick={close}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
