import { cn } from "@canvas/lib/utils";
import { EmptyState } from "@canvas/ui/empty-state";
import { textStyles } from "@canvas/ui/text";
import type {
  ReviewCanvasContent,
  ReviewCanvasHandle,
  ReviewCanvasUi,
} from "@chalk/review-contracts";
import { createRoot } from "react-dom/client";

import { ReviewHome } from "./home/review-home-view";
import { WelcomePage } from "./home/welcome-page";
import { CanvasUiContext } from "./host/canvas-ui";
import { ApiCanvas } from "./review/api-canvas";
import {
  type ReviewFindHost,
  createReviewFindHost,
} from "./review/review-find";
import { ReviewContainerProvider } from "./review/review-root-context";
import { SettingsPage } from "./settings/settings-page";
import { shellStyles } from "./styles/shell-styles";
import { themeStyles } from "./styles/theme-styles";

import "./styles.css";

export { clearPersistedReviewViewState as clearReviewViewState } from "./review/review-view-state";

export function reviewCanvasThemeClass(theme: "dark" | "light"): string {
  const light = theme === "light";

  return cn(themeStyles.vars, light && themeStyles.light);
}

function ReviewCanvas({
  content,
  findHost,
}: {
  content: ReviewCanvasContent;
  findHost: ReviewFindHost;
}) {
  if (content.kind === "api")
    return (
      <div data-review-api="" className={shellStyles.apiCanvas}>
        <ApiCanvas
          key={content.reviewId}
          content={content}
          findHost={findHost}
        />
      </div>
    );

  if (content.kind === "home") return <Home content={content} />;

  if (content.kind === "source") {
    if (content.error) {
      return (
        <EmptyState
          className={styles.sourceEmpty}
          title="Worktree unavailable"
          message={content.error}
        />
      );
    }

    return (
      <EmptyState
        className={styles.sourceEmpty}
        title="Select a file in the source tree"
        message="⌘B toggles the tree"
      />
    );
  }

  if (content.kind === "welcome") {
    return (
      <WelcomePage
        install={content.install}
        setupActions={content.setupActions}
        onClose={content.close}
        onboarding={content.onboarding}
        onOpenTutorial={content.openTutorial}
      />
    );
  }

  if (content.kind === "settings") {
    return <SettingsPage settings={content.settings} />;
  }

  if (content.kind === "error") {
    return (
      <CanvasShell title="Session unavailable">
        <p className={styles.shellText}>{content.message}</p>
      </CanvasShell>
    );
  }

  return null;
}

function Home({
  content,
}: {
  content: Extract<ReviewCanvasContent, { kind: "home" }>;
}) {
  const deleteReview = content.deleteReview;
  const dismissReview = content.dismissReview;
  const restoreReview = content.restoreReview;

  return (
    <ReviewHome
      reviews={content.reviews}
      onOpen={(review) => content.openReview(review.reviewId)}
      onDelete={
        deleteReview ? (review) => deleteReview(review.reviewId) : undefined
      }
      onDismiss={
        dismissReview ? (review) => dismissReview(review.reviewId) : undefined
      }
      onRestore={
        restoreReview ? (review) => restoreReview(review.reviewId) : undefined
      }
      install={content.install}
      setupActions={content.setupActions}
      onboarding={content.onboarding}
      onOpenTutorial={content.openTutorial}
    />
  );
}

function CanvasShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className={styles.shell}>
      <div className={cn(textStyles.eyebrow, styles.brand)}>Chalk</div>
      <h1 className={styles.shellTitle}>{title}</h1>
      {children}
    </main>
  );
}

// The canvas shares the workbench DOM, so outside a session (which carries its
// own theme bridge) the workbench root is the theme authority.
function workbenchColorTheme(container: HTMLElement): "dark" | "light" {
  const workbench = container.ownerDocument.querySelector(".monaco-workbench");

  if (!workbench) return "dark";

  return workbench.classList.contains("vs-dark") ||
    workbench.classList.contains("hc-black")
    ? "dark"
    : "light";
}

export function mountReviewCanvas(
  container: HTMLElement,
  initialContent: ReviewCanvasContent,
  ui?: ReviewCanvasUi,
): ReviewCanvasHandle {
  let content = initialContent;

  let disposed = false;
  let themeSubscription: { dispose(): void } | null = null;
  const findHost = createReviewFindHost();
  container.classList.add("review-canvas-root");
  // The canvas stylesheet is compiled inside @scope (.review-canvas-root),
  // where the scope root itself is only matched by :scope — a theme class on
  // the container would never match the light token block. The theme class
  // must live on an in-scope descendant, so all content renders inside this
  // host element.
  const themeHost = container.ownerDocument.createElement("div");

  // Apply palette overrides with the current theme.
  const applyTheme = (theme: "dark" | "light") => {
    const light = theme === "light";

    container.dataset.reviewTheme = theme;
    themeHost.className = [
      light && "review-app--theme-light",
      cn(themeStyles.vars, styles.themeHost, light && themeStyles.light),
    ]
      .filter(Boolean)
      .join(" ");
  };

  applyTheme("dark");
  container.appendChild(themeHost);
  const root = createRoot(themeHost);

  const render = () => {
    themeSubscription?.dispose();
    themeSubscription = null;

    resetSessionDiagnostics(container);

    if (content.kind === "api") {
      applyTheme(content.bridge.currentTheme());
      themeSubscription = content.bridge.onDidChangeTheme(applyTheme);
    } else if (ui?.theme) {
      applyTheme(ui.theme.current());
      themeSubscription = ui.theme.subscribe(applyTheme);
    } else {
      applyTheme(workbenchColorTheme(container));

      const workbench =
        container.ownerDocument.querySelector(".monaco-workbench");

      if (workbench) {
        const observer = new MutationObserver(() => {
          applyTheme(workbenchColorTheme(container));
        });

        observer.observe(workbench, {
          attributes: true,
          attributeFilter: ["class"],
        });
        themeSubscription = { dispose: () => observer.disconnect() };
      }
    }

    root.render(
      <ReviewContainerProvider container={container}>
        <CanvasUiContext.Provider value={ui}>
          <ReviewCanvas content={content} findHost={findHost} />
        </CanvasUiContext.Provider>
      </ReviewContainerProvider>,
    );
  };

  render();

  return {
    update(next) {
      if (disposed) return;
      content = next;
      render();
    },
    focus() {
      container.focus();
    },
    showFind(seed) {
      return content.kind === "api" && findHost.showFind(seed);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      themeSubscription?.dispose();
      themeSubscription = null;
      root.unmount();
      themeHost.remove();
      container.classList.remove("review-canvas-root");
    },
  };
}

function resetSessionDiagnostics(container: HTMLElement): void {
  delete container.dataset.reviewDiffSummaryRequestCount;
  delete container.dataset.reviewDiffSummaryReadyCount;
  delete container.dataset.reviewDiffSummaryStartedAfterMount;
  delete container.dataset.reviewDiffSummaryIncludePatch;
}

const styles = {
  // Layout-neutral: it only carries the theme inside the scope boundary.
  themeHost: "tw:[display:contents]",
  // The Source tab's VS Code-like watermark: quiet text centered in the
  // empty editor area, next to the native file tree.
  sourceEmpty:
    "tw:items-center tw:justify-center tw:h-full tw:text-center tw:select-none",
  shell:
    "tw:w-[min(760px,_100%)] tw:m-[0_auto] tw:p-[32px] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-display)] tw:text-[length:13px] tw:font-normal tw:leading-[1.55]",
  shellTitle: "tw:m-[10px_0_6px] tw:text-[length:22px]",
  shellText: "tw:text-[color:var(--ink-muted)]",
  brand: "tw:text-[color:var(--ink-muted)]",
};
