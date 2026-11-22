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
import { Input } from "@canvas/components/ui/input";
import { Switch } from "@canvas/components/ui/switch";
import {
  mountReviewCanvas,
  reviewCanvasThemeClass,
} from "@canvas/desktop-entry";
import { codeThemeMode } from "@canvas/diff/code-appearance";
import {
  REVIEW_CANVAS_RESUME_EVENT,
  ReviewApiClient,
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
  ReviewCanvasUi,
  ReviewSourceView,
  ReviewTheme,
  ReviewVerbRequest,
  ReviewVerbResponse,
} from "@chalk/review-contracts";
import { fuzzyMatches } from "@review/lib/fuzzy-match";
import {
  ChevronDownIcon,
  FileTextIcon,
  FileWarningIcon,
  GitMergeIcon,
  SearchIcon,
  Settings2Icon,
  SquareArrowOutUpRightIcon,
  SquareCheckIcon,
  SquareIcon,
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

import { AppearanceSettings, applyFonts } from "./appearance-settings";
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
  const listeners = useRef(new Set<() => void>());
  const [connected, setConnected] = useState(true);
  const connectedRef = useRef(true);
  const [loaded, setLoaded] = useState(false);
  const [install, setInstall] = useState<ReviewCanvasInstallContent>();
  const [error, setError] = useState<string>();
  const [settings, setSettings] = useState(false);
  const [setup, setSetup] = useState(false);

  // The palette swaps between its main page and the incompatible-review cleanup page.
  const [palette, setPalette] = useState<"reviews" | "incompatible" | null>(
    null,
  );

  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);

  // Accepts a URL copied from any MR tab (/diffs, #note_1); the server validates the rest.
  const mergeRequestUrl =
    /^(https:\/\/\S+?\/-\/merge_requests\/[1-9]\d*)(?:[/?#]\S*)?$/.exec(
      search.trim(),
    )?.[1];

  // Each page, and each reopening, starts with an empty search.
  useEffect(() => setSearch(""), [palette]);

  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
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

  // A code theme with one variant decides the mode; the user's choice is kept for later.
  const theme = () =>
    codeThemeMode(prefs.current.codeTheme) ??
    (prefs.current.theme === "system"
      ? media.current.matches
        ? "dark"
        : "light"
      : prefs.current.theme);

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

  // The server returns the MR's existing review, or imports it without a Chalk page or lenses.
  async function openMergeRequest(url: string) {
    requireConnected();

    const reviewId =
      mergeRequestReview(url)?.reviewId ??
      (
        await api.post<{ reviewId: string }>("/commands", {
          commandId: crypto.randomUUID(),
          operation: { type: "create", mergeRequestUrl: url },
        })
      ).reviewId;

    if (catalog.current.find((item) => item.reviewId === reviewId)?.dismissedAt)
      await command({ type: "attention", reviewId, action: "restore" });
    await open(reviewId);
  }

  // shortcut: matches the imported URL only, so a moved project reads as new; the server still reuses its review.
  const mergeRequestReview = (url: string) =>
    catalog.current.find(
      (review) => review.origin?.gitlab?.url === new URL(url).href,
    );

  async function open(id: string, title?: string, makeActive = true) {
    if (catalog.current.find((item) => item.reviewId === id)?.incompatible)
      throw new Error(
        "This review was saved in an older format. Delete it from Incompatible reviews.",
      );

    if (!tabs.current.has(id)) {
      const summary =
        catalog.current.find((item) => item.reviewId === id) ??
        (await api.read<Pick<ReviewApiSummary, "title" | "version">>(
          `/${encodeURIComponent(id)}?full=true`,
        ));

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
        setPalette(null);
      }

      return;
    }

    switch (command) {
      case "commandPalette":
        setPalette("reviews");
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
        setPalette("reviews");
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

          if (summary && !summary.incompatible) add(summary);
        }

        if (abort.signal.aborted) return;
        active.current = tabs.current.has(prefs.current.activeReviewId ?? "")
          ? prefs.current.activeReviewId
          : ([...tabs.current.keys()].at(-1) ??
            summaries.find(
              (review) => !review.dismissedAt && !review.incompatible,
            )?.reviewId ??
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

          if (!summary) close(id);
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
    group: review.incompatible
      ? "incompatible"
      : review.dismissedAt
        ? "settled"
        : "open",
  }));

  const reviewItems = (group: (typeof reviews)[number]["group"]) =>
    reviews
      .filter((review) => review.group === group)
      .map((review) => (
        <CommandItem
          key={review.id}
          value={review.id}
          keywords={[review.title, review.repository]}
          disabled={!connected}
          onSelect={() => {
            setPalette(null);
            void (async () => {
              if (group === "settled")
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

  const openItems = reviewItems("open");
  const settledItems = reviewItems("settled");

  const incompatible = reviews.filter(
    (review) => review.group === "incompatible",
  );

  async function deleteMarked() {
    const ids = incompatible
      .filter((review) => marked.has(review.id))
      .map((review) => review.id);

    setPalette(null);

    if (
      await ui.confirmDelete?.(
        ids.length === 1 ? "1 review" : `${ids.length} reviews`,
      )
    )
      for (const reviewId of ids) await command({ type: "delete", reviewId });
  }

  const resolvedTheme = theme();
  const themeClass = reviewCanvasThemeClass(resolvedTheme);
  const { uiFont, codeFont, codeLigatures } = prefs.current;

  useLayoutEffect(
    () =>
      applyFonts(document.documentElement, {
        uiFont,
        codeFont,
        codeLigatures,
      }),
    [uiFont, codeFont, codeLigatures],
  );
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
            onClick={() => setPalette("reviews")}
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
            className="review-shell-views tw:flex tw:flex-none tw:items-center tw:pr-3 tw:empty:hidden tw:before:mr-3 tw:before:text-[var(--ink-faint)] tw:before:content-['/']"
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
                  : "Publish a review from your agent to get started."}
              </p>
              <Button variant="outline" onClick={() => setPalette("reviews")}>
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
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      <CommandDialog
        container={shellElement.current}
        title="Command palette"
        description="Search reviews and run Chalk commands."
        open={palette !== null}
        onOpenChange={(open) => setPalette(open ? "reviews" : null)}
        filter={(_value, search, keywords = []) =>
          fuzzyMatches(search, ...keywords) ? 1 : 0
        }
      >
        <CommandInput
          placeholder={
            palette === "incompatible"
              ? "Search incompatible reviews…"
              : "Search reviews or paste an MR link…"
          }
          value={search}
          onValueChange={setSearch}
        />
        {palette === "incompatible" ? (
          <CommandList>
            <CommandEmpty>No matching reviews.</CommandEmpty>
            <CommandGroup heading="Saved in an older format">
              {incompatible.map((review) => (
                <CommandItem
                  key={review.id}
                  value={review.id}
                  keywords={[review.title, review.repository]}
                  aria-checked={marked.has(review.id)}
                  onSelect={() =>
                    setMarked((current) => {
                      const next = new Set(current);

                      if (!next.delete(review.id)) next.add(review.id);

                      return next;
                    })
                  }
                >
                  {marked.has(review.id) ? (
                    <SquareCheckIcon aria-hidden="true" />
                  ) : (
                    <SquareIcon aria-hidden="true" />
                  )}
                  <span className="review-shell-review-label tw:flex tw:min-w-0 tw:flex-col tw:gap-1 tw:text-left tw:text-xs tw:[&_span]:truncate">
                    <span title={review.title}>{review.title}</span>
                    <span className="review-shell-review-repository tw:text-[11px] tw:text-[var(--ink-faint)]">
                      {review.repository}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Chalk">
              <CommandItem
                keywords={["Delete selected"]}
                disabled={!connected || marked.size === 0}
                onSelect={() => void deleteMarked().catch(fail)}
              >
                <FileWarningIcon aria-hidden="true" /> Delete selected
                {marked.size > 0 && ` (${marked.size})`}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        ) : (
          <CommandList>
            <CommandEmpty>
              {loaded ? "No matching reviews." : "Loading reviews…"}
            </CommandEmpty>
            {mergeRequestUrl && (
              <CommandGroup heading="GitLab">
                <CommandItem
                  value={mergeRequestUrl}
                  keywords={[search]}
                  disabled={!connected || importing}
                  onSelect={() => {
                    setImporting(true);
                    void openMergeRequest(mergeRequestUrl)
                      .catch(fail)
                      .finally(() => {
                        setImporting(false);
                        setPalette(null);
                      });
                  }}
                >
                  <GitMergeIcon aria-hidden="true" />
                  {mergeRequestReview(mergeRequestUrl)
                    ? importing
                      ? "Opening review…"
                      : "Open review"
                    : importing
                      ? "Creating review…"
                      : "Create review"}
                </CommandItem>
              </CommandGroup>
            )}
            {/* cmdk shows an empty group's heading, so skip groups with no reviews. */}
            {openItems.length > 0 && (
              <CommandGroup heading="Reviews">{openItems}</CommandGroup>
            )}
            {settledItems.length > 0 && (
              <CommandGroup heading="Settled">{settledItems}</CommandGroup>
            )}
            <CommandGroup heading="Chalk">
              <CommandItem
                keywords={["Command setup"]}
                disabled={!connected}
                onSelect={() => {
                  setPalette(null);
                  setSetup(true);
                }}
              >
                <TerminalIcon aria-hidden="true" /> Command setup
              </CommandItem>
              <CommandItem
                keywords={["Settings"]}
                onSelect={() => {
                  setPalette(null);
                  setSettings(true);
                }}
              >
                <Settings2Icon aria-hidden="true" /> Settings
              </CommandItem>
              {incompatible.length > 0 && (
                <CommandItem
                  keywords={["Incompatible reviews"]}
                  onSelect={() => {
                    setMarked(new Set());
                    setPalette("incompatible");
                  }}
                >
                  <FileWarningIcon aria-hidden="true" /> Incompatible reviews (
                  {incompatible.length})
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        )}
      </CommandDialog>
      {settings && (
        <SettingsDialog
          container={shellElement.current}
          preferences={prefs.current}
          mode={resolvedTheme}
          save={(patch) => {
            void save(patch).catch(fail);
          }}
          hasGitLabToken={(host) =>
            options.rpc.request.hasGitLabToken({ host })
          }
          saveGitLabToken={(host, token) =>
            options.rpc.request.saveGitLabToken({ host, token })
          }
          fail={fail}
          close={() => setSettings(false)}
        />
      )}
    </div>
  );
}

function SettingsDialog({
  container,
  preferences,
  mode,
  save,
  hasGitLabToken,
  saveGitLabToken,
  fail,
  close,
}: {
  container: HTMLElement | null;
  preferences: ShellPreferences;
  mode: ReviewTheme;
  save: (patch: Partial<ShellPreferences>) => void;
  hasGitLabToken: (host: string) => Promise<boolean>;
  saveGitLabToken: (host: string, token: string) => Promise<void>;
  fail: (cause: unknown) => void;
  close: () => void;
}) {
  const previousFocus = useRef(document.activeElement);

  const [gitlabHost, setGitlabHost] = useState("gitlab.com");
  const [gitlabSaved, setGitlabSaved] = useState(false);
  const [replacingToken, setReplacingToken] = useState(false);

  useEffect(() => {
    let current = true;
    setGitlabSaved(false);
    setReplacingToken(false);
    hasGitLabToken(gitlabHost).then((saved) => {
      if (current) setGitlabSaved(saved);
    }, fail);

    return () => {
      current = false;
    };
  }, [gitlabHost]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        container={container}
        aria-describedby={undefined}
        className="review-shell-settings tw:max-w-[min(600px,calc(100%-32px))] tw:max-h-[calc(100%-32px)] tw:overflow-y-auto tw:font-[family-name:var(--chrome-font)] tw:text-sm"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const previous = previousFocus.current;

          if (previous instanceof HTMLElement && previous.isConnected)
            previous.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="review-shell-settings-fields tw:grid tw:gap-6 tw:py-3 tw:[&_section]:grid tw:[&_section]:gap-4 tw:[&_h3]:text-xs tw:[&_h3]:font-medium tw:[&_h3]:text-muted-foreground tw:[&_label]:flex tw:[&_label]:items-center tw:[&_label]:justify-between tw:[&_label]:gap-4 tw:[&_select]:min-w-[132px]">
          <AppearanceSettings
            preferences={preferences}
            mode={mode}
            container={container}
            save={save}
          />
          <section>
            <h3>General</h3>
            <label htmlFor="shell-debug-logging">
              <span>Debug logging</span>
              <Switch
                id="shell-debug-logging"
                checked={preferences.debugLogging}
                onCheckedChange={(debugLogging) => save({ debugLogging })}
              />
            </label>
          </section>
          <section>
            <h3>GitLab</h3>
            <label htmlFor="shell-gitlab-host">
              <span>Host</span>
              <Input
                id="shell-gitlab-host"
                className="tw:max-w-[200px]"
                value={gitlabHost}
                onChange={(event) => setGitlabHost(event.target.value.trim())}
              />
            </label>
            <label htmlFor="shell-gitlab-token">
              <span>Token</span>
              {/* A saved token stays locked until the user explicitly asks to replace it. */}
              {gitlabSaved && !replacingToken ? (
                <Button
                  variant="outline"
                  onClick={() => setReplacingToken(true)}
                >
                  Replace saved token
                </Button>
              ) : (
                <Input
                  id="shell-gitlab-token"
                  key={gitlabHost}
                  className="tw:max-w-[200px]"
                  type="password"
                  autoComplete="off"
                  autoFocus={replacingToken}
                  placeholder="Paste a token"
                  onBlur={(event) => {
                    const token = event.target.value.trim();

                    // Blank keeps the saved token.
                    if (!token || !gitlabHost) return setReplacingToken(false);
                    saveGitLabToken(gitlabHost, token).then(() => {
                      setGitlabSaved(true);
                      setReplacingToken(false);
                    }, fail);
                  }}
                />
              )}
            </label>
          </section>
        </div>
        <DialogFooter>
          <Button onClick={close}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
