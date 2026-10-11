import { Button } from "@canvas/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canvas/components/ui/dialog";
import { Input } from "@canvas/components/ui/input";
import { NativeSelect } from "@canvas/components/ui/native-select";
import {
  mountReviewCanvas,
  reviewCanvasThemeClass,
} from "@canvas/desktop-entry";
import {
  REVIEW_CANVAS_RESUME_EVENT,
  REVIEW_DISCORD_URL,
  ReviewApiClient,
  ReviewApiError,
  parseReviewCliInstallStatus,
  reviewSourceAnchor,
  reviewSourceComparison,
} from "@dev.fast/review-protocol";
import type {
  ReviewApiSummary,
  ReviewCanvasContent,
  ReviewCanvasHandle,
  ReviewCanvasInstallContent,
  ReviewCanvasTutorialBridge,
  ReviewCanvasUi,
  ReviewSourceView,
  ReviewVerbRequest,
  ReviewVerbResponse,
  TutorialProgressV1,
} from "@dev.fast/review-protocol";
import {
  BookOpenIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
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
  const uiRef = useRef<ReturnType<typeof createCanvasUi>>(undefined);
  const [, render] = useReducer((value) => value + 1, 0);
  const tabs = useRef(new Map<string, Tab>());
  const catalog = useRef<ReviewApiSummary[]>([]);
  const active = useRef<string | null>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const sidebarSearch = useRef<HTMLInputElement>(null);
  const setupButton = useRef<HTMLButtonElement>(null);
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

  const [sidebarHidden, setSidebarHidden] = useState(
    options.state.preferences.sidebarHidden,
  );

  const sidebarHiddenRef = useRef(sidebarHidden);
  sidebarHiddenRef.current = sidebarHidden;
  const [query, setQuery] = useState("");
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

    if (!response.ok) throw new Error("Cannot load Blackboard command setup.");
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
          result?.output ?? result?.error ?? "Blackboard command setup failed.",
        );
      }

      return (await loadInstall()).status;
    };

    const content: ReviewCanvasInstallContent = {
      status,
      apply: (body) => mutate("apply", body),
      remove: (body) => mutate("remove", body),
      removeLegacySkills: () => mutate("legacy-skills/remove"),
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

      if (!active.current) setSidebarHidden(false);
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

    if (shellElement.current?.querySelector('[data-slot="dialog-content"]')) {
      if (command === "closeTab") {
        setSettings(false);
        setSetup(false);
      }

      return;
    }

    switch (command) {
      case "toggleSidebar":
        toggleSidebar();
        break;
      case "settings":
        setSettings(true);
        break;
      case "closeTab":
        if (active.current) close(active.current);
        break;
      case "find":
        if (active.current)
          tabs.current.get(active.current)?.handle?.showFind();
        else {
          setSidebarHidden(false);
          requestAnimationFrame(() => sidebarSearch.current?.focus());
        }

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
              : key === "b" && event.shiftKey
                ? "toggleSidebar"
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
        for (const [id] of tabs.current)
          if (
            !summaries.some((item) => item.reviewId === id) &&
            !tutorialIds.current.has(id)
          )
            close(id);
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

  function toggleSidebar() {
    const next = !sidebarHiddenRef.current;
    sidebarHiddenRef.current = next;
    setSidebarHidden(next);
    void save({ sidebarHidden: next }).catch(fail);
    sidebarToggle.current?.focus();
  }

  function reviewMenu(anchor: HTMLElement, id: string, title: string) {
    const review = catalog.current.find((item) => item.reviewId === id);
    ui.showMenu({
      anchor,
      items: [
        ...(tabs.current.has(id)
          ? [{ id: "close", label: "Close review" }]
          : []),
        ...(review && review.kind !== "scratchpad"
          ? [
              {
                id: "attention",
                label: review.dismissedAt ? "Restore review" : "Dismiss review",
              },
              { id: "delete", label: "Delete review…" },
            ]
          : []),
      ],
      onHide() {},
      onSelect: async (action) => {
        if (action === "close") close(id);
        else if (action === "attention")
          await command({
            type: "attention",
            reviewId: id,
            action: review?.dismissedAt ? "restore" : "dismiss",
          });
        else if (action === "delete" && (await ui.confirmDelete?.(title)))
          await command({ type: "delete", reviewId: id });
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

  const needle = query.trim().toLowerCase();

  const filtered = reviews.filter((review) =>
    `${review.title} ${review.repository}`.toLowerCase().includes(needle),
  );

  const reviewRows = (dismissed: boolean) =>
    filtered
      .filter((review) => review.dismissed === dismissed)
      .map((review) => (
        <div
          key={review.id}
          className="review-shell-review tw:mb-1 tw:flex tw:items-center tw:rounded-md tw:data-[active=true]:bg-muted"
          data-active={active.current === review.id}
        >
          <Button
            variant="ghost"
            className="review-shell-review-link tw:h-auto tw:min-h-12 tw:min-w-0 tw:flex-1 tw:justify-start tw:p-2 tw:text-muted-foreground tw:aria-[current=page]:text-foreground"
            aria-current={active.current === review.id ? "page" : undefined}
            onClick={() => {
              void open(review.id).catch(fail);

              if (matchMedia("(max-width: 760px)").matches) {
                setSidebarHidden(true);
                sidebarToggle.current?.focus();
              }
            }}
          >
            <FileTextIcon aria-hidden="true" />
            <span className="review-shell-review-label tw:flex tw:min-w-0 tw:flex-col tw:gap-1 tw:text-left tw:text-xs tw:[&_span]:truncate">
              <span title={review.title}>{review.title}</span>
              <span className="review-shell-review-repository tw:text-[11px] tw:text-[var(--ink-faint)]">
                {review.repository}
              </span>
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="review-shell-review-menu tw:flex-none tw:text-muted-foreground"
            aria-label={`Actions for ${review.title}`}
            disabled={!connected}
            onClick={(event) =>
              reviewMenu(event.currentTarget, review.id, review.title)
            }
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        </div>
      ));

  const resolvedTheme = theme();
  const themeClass = reviewCanvasThemeClass(resolvedTheme);
  const currentTab = tabs.current.get(active.current ?? "");

  const currentReview = catalog.current.find(
    (review) => review.reviewId === active.current,
  );

  return (
    <div
      ref={shellElement}
      className={[
        "review-shell tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:bg-background tw:text-foreground tw:font-[family-name:var(--chrome-font)] tw:text-sm tw:antialiased",
        themeClass,
      ].join(" ")}
      data-theme={resolvedTheme}
    >
      <header
        className="review-shell-titlebar electrobun-webkit-app-region-drag tw:flex tw:h-14 tw:flex-none tw:items-center tw:gap-4 tw:border-b tw:border-border tw:bg-[var(--tray)] tw:px-4 tw:select-none tw:[-webkit-app-region:drag] tw:data-[native-titlebar]:pl-[88px] tw:[&_button]:[-webkit-app-region:no-drag] tw:max-[760px]:gap-2 tw:max-[760px]:pr-2"
        data-native-titlebar={options.nativeTitlebar || undefined}
      >
        <Button
          ref={sidebarToggle}
          variant="ghost"
          size="icon"
          aria-label={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
          aria-expanded={!sidebarHidden}
          aria-controls="review-shell-sidebar"
          title="Toggle sidebar (⌘⇧B)"
          onClick={toggleSidebar}
        >
          <PanelLeftIcon aria-hidden="true" />
        </Button>
        <div
          className="review-shell-context tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-3 tw:border-l tw:border-border tw:pl-4 tw:leading-5 tw:max-[760px]:gap-2 tw:max-[760px]:pl-2"
          aria-label="Current review"
        >
          {currentTab && (
            <>
              <span
                className="review-shell-repository tw:max-w-[180px] tw:truncate tw:text-muted-foreground tw:max-[760px]:max-w-24 tw:max-[480px]:hidden"
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
            className="review-shell-current-title tw:truncate tw:font-medium"
            title={currentTab?.title || "Blackboard"}
          >
            {currentTab?.title || "Blackboard"}
          </span>
        </div>
        <div className="review-shell-actions tw:flex tw:flex-none tw:items-center tw:gap-1 tw:text-muted-foreground">
          {currentTab && (
            <Button
              variant="outline"
              className="review-shell-editor tw:mr-2 tw:border-border tw:text-xs tw:[&_span]:leading-5 tw:max-[760px]:mr-0 tw:max-[760px]:w-9 tw:max-[760px]:p-0 tw:max-[760px]:[&_span]:hidden"
              aria-label="Open in VS Code"
              title="Open review workspace in VS Code"
              disabled={!connected}
              onClick={() =>
                void dispatch({ name: "openSourceTree", args: {} })
              }
            >
              <SquareArrowOutUpRightIcon aria-hidden="true" />
              <span>Open in VS Code</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Find"
            title="Find (⌘F)"
            disabled={!loaded || !connected}
            onClick={() => invoke("find")}
          >
            <SearchIcon aria-hidden="true" />
          </Button>
          {sidebarHidden && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              title="Settings (⌘,)"
              onClick={() => setSettings(true)}
            >
              <Settings2Icon aria-hidden="true" />
            </Button>
          )}
        </div>
      </header>
      {!connected && (
        <div
          className="review-shell-notice tw:flex tw:items-center tw:justify-between tw:border-b tw:border-border tw:bg-[var(--tray)] tw:px-4 tw:py-2"
          role="status"
        >
          Reconnecting to review server…
        </div>
      )}
      {error && (
        <div
          className="review-shell-notice tw:flex tw:items-center tw:justify-between tw:border-b tw:border-border tw:bg-[var(--tray)] tw:px-4 tw:py-2"
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
      <div className="review-shell-body tw:relative tw:flex tw:min-h-0 tw:flex-1">
        <aside
          id="review-shell-sidebar"
          className="review-shell-sidebar tw:flex tw:w-[272px] tw:min-h-0 tw:flex-none tw:flex-col tw:border-r tw:border-border tw:bg-[var(--tray)] tw:px-3 tw:pt-4 tw:pb-3 tw:[&[hidden]]:hidden tw:max-[760px]:absolute tw:max-[760px]:inset-y-0 tw:max-[760px]:left-0 tw:max-[760px]:z-3 tw:max-[760px]:w-[min(272px,calc(100%-56px))] tw:max-[760px]:shadow-[8px_0_24px_var(--backdrop)]"
          aria-label="Sidebar"
          hidden={sidebarHidden}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              toggleSidebar();
            }
          }}
        >
          <div className="review-shell-sidebar-heading tw:px-2 tw:pb-4 tw:text-sm tw:font-semibold tw:tracking-[-0.04em]">
            Blackboard
          </div>
          <div className="review-shell-sidebar-search tw:mb-4 tw:flex tw:items-center tw:gap-2 tw:rounded-md tw:border tw:border-border tw:bg-background tw:p-2 tw:text-muted-foreground tw:[&_svg]:size-4 tw:[&_svg]:flex-none">
            <SearchIcon aria-hidden="true" />
            <Input
              className="tw:h-auto tw:border-0 tw:bg-transparent tw:p-0 tw:text-xs tw:text-foreground tw:shadow-none tw:focus-visible:ring-0"
              ref={sidebarSearch}
              type="search"
              aria-label="Search reviews"
              placeholder="Search reviews…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <nav
            className="review-shell-review-list tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:[scrollbar-width:thin]"
            aria-label="Reviews"
            inert={!connected}
          >
            <div className="review-shell-sidebar-label tw:p-2 tw:text-xs tw:font-medium tw:text-muted-foreground tw:[&:is(summary)]:mt-4 tw:[&:is(summary)]:cursor-pointer">
              Reviews
            </div>
            {reviewRows(false)}
            {filtered.length === 0 && (
              <p className="review-shell-sidebar-empty tw:p-2 tw:text-xs tw:text-muted-foreground">
                {!loaded
                  ? "Loading reviews…"
                  : needle
                    ? "No matching reviews."
                    : "No reviews yet."}
              </p>
            )}
            {filtered.some((review) => review.dismissed) && (
              <details open={needle ? true : undefined}>
                <summary className="review-shell-sidebar-label tw:p-2 tw:text-xs tw:font-medium tw:text-muted-foreground tw:[&:is(summary)]:mt-4 tw:[&:is(summary)]:cursor-pointer">
                  Dismissed
                </summary>
                {reviewRows(true)}
              </details>
            )}
          </nav>
          <div className="review-shell-sidebar-footer tw:flex tw:flex-none tw:flex-col tw:gap-1 tw:border-t tw:border-border tw:pt-3 tw:[&_button]:justify-start tw:[&_button]:text-xs tw:[&_button]:text-muted-foreground">
            <Button
              variant="ghost"
              disabled={!connected}
              onClick={() => void openTutorial().catch(fail)}
            >
              <BookOpenIcon aria-hidden="true" /> Tutorial
            </Button>
            <Button
              ref={setupButton}
              variant="ghost"
              disabled={!connected}
              onClick={() => setSetup(true)}
            >
              <TerminalIcon aria-hidden="true" /> Command setup
            </Button>
            <Button variant="ghost" onClick={() => setSettings(true)}>
              <Settings2Icon aria-hidden="true" /> Settings
            </Button>
          </div>
        </aside>
        {!sidebarHidden && (
          <button
            className="review-shell-sidebar-backdrop tw:hidden tw:max-[760px]:absolute tw:max-[760px]:inset-0 tw:max-[760px]:z-2 tw:max-[760px]:block tw:max-[760px]:border-0 tw:max-[760px]:bg-[var(--backdrop)] tw:focus-visible:outline-2 tw:focus-visible:outline-ring"
            aria-label="Close sidebar"
            onClick={toggleSidebar}
          />
        )}
        <main
          className="review-shell-content tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-hidden"
          inert={!connected}
        >
          {!loaded ? (
            <div className="review-shell-loading tw:p-8" role="status">
              {error
                ? "Unable to load reviews. Close and reopen Blackboard to retry."
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
                  ? "Choose a review from the sidebar to continue."
                  : "Publish a review from your agent, or open the tutorial to get started."}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSidebarHidden(false);
                  requestAnimationFrame(() => sidebarSearch.current?.focus());
                }}
              >
                Browse reviews
              </Button>
            </div>
          ) : null}
          {[...tabs.current.values()].map((tab) => (
            <section
              className="review-shell-review-panel tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:[&[hidden]]:hidden"
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
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              setupButton.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Command setup</DialogTitle>
              <DialogDescription>
                Connect Blackboard to your coding agent.
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
          <DialogDescription>Make Blackboard feel at home.</DialogDescription>
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
          <label htmlFor="shell-diff-layout">
            <span>Diff layout</span>
            <NativeSelect
              id="shell-diff-layout"
              aria-label="Diff layout"
              value={preferences.diffLayout}
              onChange={(event) => {
                // SAFETY: the options below contain only supported layouts.
                save({
                  diffLayout: event.target
                    .value as ShellPreferences["diffLayout"],
                });
              }}
            >
              <option value="split">Split</option>
              <option value="unified">Unified</option>
            </NativeSelect>
          </label>
          <label htmlFor="shell-default-diff-mode">
            <span>Default diff mode</span>
            <NativeSelect
              id="shell-default-diff-mode"
              aria-label="Default diff mode"
              value={preferences.defaultDiffMode}
              onChange={(event) => {
                // SAFETY: the options below contain only supported modes.
                save({
                  defaultDiffMode: event.target
                    .value as ShellPreferences["defaultDiffMode"],
                });
              }}
            >
              <option value="text">Text</option>
              <option value="structural">Structural</option>
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
