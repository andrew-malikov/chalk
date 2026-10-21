import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { cn } from "@canvas/lib/utils";
import { Button } from "@canvas/ui/button";
import { StatusBanner } from "@canvas/ui/status-banner";
import {
  type ReviewCanvasChrome,
  type ReviewCanvasRange,
  type ReviewCommitSummary,
  type ReviewDocumentWidthChoice,
} from "@chalk/review-contracts";
import {
  type SoftwareMapTopologyDiff,
  diffSoftwareMaps,
} from "@review/software-map/software-map-topology-diff";
import { Archive } from "lucide-react";
import {
  type CSSProperties,
  type ComponentType,
  type ReactElement,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  AgentSelectionProvider,
  useAgentSelection,
} from "./agent-context/agent-selection";
import { CommentsProvider } from "./comments/comments-context";
import { useDocumentEmbedScroll } from "./documents/document-embed-scroll";
import { useReviewSession } from "./host/review-session";
import { useTooltip } from "./lib/use-tooltip";
import { ChalkPage } from "./pages/chalk-page";
import { CommitsPage } from "./pages/commits-page";
import { DiffPage } from "./pages/diff-page";
import { MapPage } from "./pages/map-page";
import { PageSlotsContext } from "./pages/page-slots";
import {
  AuthoringActivityBadge,
  ReviewSurfaceLabel,
} from "./review/authoring-activity";
import { MissingCheckoutBanner } from "./review/missing-checkout-banner";
import { ReviewActionsMenu } from "./review/review-actions-menu";
import { ReviewPanelHost } from "./review/review-components";
import {
  ReviewProvider,
  type ReviewSubmissionOutcome,
  useReview,
} from "./review/review-context";
import { useReviewDiffFiles } from "./review/review-diff-files-context";
import { ReviewDiffFilesProvider } from "./review/review-diff-files-context";
import { type ReviewFindHost, ReviewFindProvider } from "./review/review-find";
import {
  useReviewPanel,
  useReviewPanelActor,
  useSuppressPanelMotionOnCanvasResume,
} from "./review/review-panel";
import { ReviewRootsProvider } from "./review/review-root-context";
import {
  type ReviewView,
  offeredReviewViews,
  reviewViewLabel,
} from "./review/review-view-route";
import { useReviewViewStateSync } from "./review/review-view-state";
import { useRightPanelResize } from "./review/side-panel-resizer";
import {
  ReviewDebugSettingsProvider,
  useReviewDebugSettings,
} from "./settings/debug-settings";
import type { NormalizedSoftwareModel } from "./software-map/model";
import { controlStyles } from "./styles/controls-styles";
import {
  appMarker,
  detailHostMarker,
  segmentMarker,
  topbarActionsMarker,
  topbarTabsMarker,
} from "./styles/markers";
import { shellStyles } from "./styles/shell-styles";
import { themeStyles } from "./styles/theme-styles";
import { TutorialExperienceProvider } from "./tutorial/tutorial-experience";
import { MarkerUnderline } from "./ui/icons";

const DEFAULT_SIDE_PEEK_WIDTH = 560;

const MIN_SIDE_PEEK_WIDTH = 360;

const MAX_SIDE_PEEK_WIDTH = 920;

const MIN_DOCUMENT_WIDTH = 560;

export function App({
  document,
  softwareMap,
  softwareMapEnabled,
  range,
  commits,
  findHost,
  chrome,
}: {
  document: RenderedReviewDocument;
  softwareMap: PublishedSoftwareMap;
  softwareMapEnabled: boolean;
  range: ReviewCanvasRange;
  commits: readonly ReviewCommitSummary[];
  findHost?: ReviewFindHost;
  chrome?: ReviewCanvasChrome;
}): ReactElement {
  return (
    <ReviewDiffFilesProvider
      documentKey={[document.routePath, document.filePath].join("\0")}
      revision={range.worktreeRevision}
      unavailable={!!range.sourceUnavailable}
    >
      <ReviewLayout
        document={document}
        softwareMap={softwareMap}
        softwareMapEnabled={softwareMapEnabled}
        range={range}
        commits={commits}
        findHost={findHost}
        chrome={chrome}
      />
    </ReviewDiffFilesProvider>
  );
}

export interface PublishedSoftwareMap {
  head: NormalizedSoftwareModel | null;
  base: NormalizedSoftwareModel | null;
}

export interface RenderedReviewDocument {
  render: ComponentType;
  key: string;
  routePath: string;
  filePath: string;
  anchors: ReadonlyMap<string, import("@review/documents/authoring").AnchorRef>;
  documentSoftwareModels: NormalizedSoftwareModel[];
  tocEntries?: import("./documents/review-document-headings").ReviewTocEntry[];
  /** True while the document has no blocks at all, as right after creation. */
  empty?: boolean;
  header: boolean;
  databaseLens: boolean;
  width?: ReviewDocumentWidthChoice;
}

function ReviewLayout({
  document,
  softwareMap,
  softwareMapEnabled,
  range,
  commits,
  findHost,
  chrome,
}: {
  document: RenderedReviewDocument;
  softwareMap: PublishedSoftwareMap;
  softwareMapEnabled: boolean;
  range: ReviewCanvasRange;
  commits: readonly ReviewCommitSummary[];
  findHost?: ReviewFindHost;
  chrome?: ReviewCanvasChrome;
}): ReactElement {
  const documentRoute = document.routePath;
  const documentRevision = document.key;

  const articleRef = useRef<HTMLElement | null>(null);
  const appRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const scrollRegionRef = useRef<HTMLElement | null>(null);

  const roots = useMemo(
    () => ({ appRef, shellRef, scrollRegionRef, articleRef }),
    [],
  );

  return (
    <ReviewRootsProvider roots={roots}>
      <ReviewFindProvider
        articleRef={articleRef}
        documentKey={documentRevision}
        host={findHost}
      >
        <ReviewDebugSettingsProvider>
          <ReviewProvider
            key={documentRoute}
            documentRoute={documentRoute}
            softwareMapEnabled={softwareMapEnabled}
          >
            <CommentsProvider>
              <AgentSelectionProvider revision={documentRevision}>
                <ReviewLayoutContent
                  appRef={appRef}
                  shellRef={shellRef}
                  scrollRegionRef={scrollRegionRef}
                  articleRef={articleRef}
                  document={document}
                  softwareModels={[
                    ...(softwareMap.head ? [softwareMap.head] : []),
                    ...document.documentSoftwareModels,
                  ]}
                  repoSoftwareMap={softwareMap.head ?? null}
                  baseSoftwareMap={softwareMap.base ?? null}
                  softwareMapTopologyDiff={diffSoftwareMaps(
                    softwareMap.base,
                    softwareMap.head,
                  )}
                  softwareMapEnabled={softwareMapEnabled}
                  range={range}
                  commits={commits}
                  chrome={chrome}
                />
              </AgentSelectionProvider>
            </CommentsProvider>
          </ReviewProvider>
        </ReviewDebugSettingsProvider>
      </ReviewFindProvider>
    </ReviewRootsProvider>
  );
}

function ReviewLayoutContent({
  appRef,
  shellRef,
  scrollRegionRef,
  articleRef,
  document,
  softwareModels,
  repoSoftwareMap,
  baseSoftwareMap,
  softwareMapTopologyDiff,
  softwareMapEnabled,
  range,
  commits,
  chrome,
}: {
  appRef: RefObject<HTMLDivElement | null>;
  shellRef: RefObject<HTMLElement | null>;
  scrollRegionRef: RefObject<HTMLElement | null>;
  articleRef: RefObject<HTMLElement | null>;
  document: RenderedReviewDocument;
  softwareModels: NormalizedSoftwareModel[];
  repoSoftwareMap: NormalizedSoftwareModel | null;
  baseSoftwareMap: NormalizedSoftwareModel | null;
  softwareMapTopologyDiff: SoftwareMapTopologyDiff | null;
  softwareMapEnabled: boolean;
  range: ReviewCanvasRange;
  commits: readonly ReviewCommitSummary[];
  chrome?: ReviewCanvasChrome;
}): ReactElement {
  const session = useReviewSession();
  const review = useReview();
  // The scratchpad is a document and nothing else: no source tree to browse,
  // nothing to dismiss.
  const scratchpad = session.review?.kind === "scratchpad";
  const panelActor = useReviewPanelActor();
  useSuppressPanelMotionOnCanvasResume(appRef);
  const activePanel = useReviewPanel((state) => state.context.active);
  const panelMotion = useReviewPanel((state) => state.context.motion);
  const activeView = useReviewPanel((state) => state.value);
  const diffScope = useReviewPanel((state) => state.context.diffScope);

  const showView = (view: ReviewView) =>
    panelActor.send({ type: "showView", view });

  const debugSettings = useReviewDebugSettings();

  const [toolbarStart, setToolbarStart] = useState<HTMLElement | null>(null);
  const [toolbarEnd, setToolbarEnd] = useState<HTMLElement | null>(null);
  const [pageOverlay, setPageOverlay] = useState<HTMLElement | null>(null);
  const [pageToolbarShown, setPageToolbarShown] = useState(false);

  const pageSlots = useMemo(
    () => ({
      toolbarStart,
      toolbarEnd,
      overlay: pageOverlay,
      showToolbar: setPageToolbarShown,
    }),
    [toolbarStart, toolbarEnd, pageOverlay],
  );

  const rightPanelOpen = activePanel !== null;

  const sidePeekResize = useRightPanelResize({
    stateKey: "side-peek-width",
    defaultWidth: DEFAULT_SIDE_PEEK_WIDTH,
    minWidth: MIN_SIDE_PEEK_WIDTH,
    maxWidth: MAX_SIDE_PEEK_WIDTH,
    maxContainerFraction: 0.5,
    minMainWidth: MIN_DOCUMENT_WIDTH,
    separatorWidth: 10,
    label: "Resize side peek",
    containerRef: appRef,
    active: rightPanelOpen,
  });

  useDocumentEmbedScroll(scrollRegionRef);
  useReviewViewStateSync({ scrollRegionRef, panelActor });

  const hasChangeRange =
    !!range.worktreeRevision || range.baseCommit !== range.headCommit;

  const banner = review.historicalRevision ? (
    <StatusBanner
      action={
        <Button
          onClick={() =>
            void session.surface.post({ name: "openReviewRevision", args: {} })
          }
        >
          Back to latest
        </Button>
      }
    >
      You are viewing an older version of this session.
    </StatusBanner>
  ) : range.sourceUnavailable ? (
    <MissingCheckoutBanner
      worktree={session.review?.targetKind === "worktree"}
    />
  ) : null;

  const selectForAgent = useAgentSelection();
  useEffect(() => {
    selectForAgent(null);
  }, [activeView, diffScope, selectForAgent]);

  const diffFiles = useReviewDiffFiles();

  const filesTabFileCount = diffScope
    ? diffScope.commit.fileCount
    : diffFiles.status === "loaded"
      ? diffFiles.files.length
      : null;

  const reviewViews = useMemo(
    () =>
      offeredReviewViews({
        hasChangeRange,
        softwareMapEnabled,
      }),
    [hasChangeRange, softwareMapEnabled],
  );

  useLayoutEffect(() => {
    panelActor.send({ type: "setAvailableViews", views: reviewViews });
  }, [panelActor, reviewViews]);

  // Subscribe before the canvas signals ready so a reveal immediately after
  // mounting cannot outrun the listener.
  useLayoutEffect(() => {
    return session.surface.subscribe((event) => {
      if (event.event !== "showReviewView") return;
      const { availableViews } = panelActor.getSnapshot().context;

      if (availableViews.includes(event.view))
        panelActor.send({ type: "showView", view: event.view });
    });
  }, [panelActor, session.surface]);

  // SAFETY: `--side-peek-width` is a CSS custom property, which React forwards
  // to style.setProperty; the CSSProperties typings only omit custom names.
  const appStyle = rightPanelOpen
    ? ({
        "--side-peek-width": `${sidePeekResize.width}px`,
      } as CSSProperties)
    : undefined;

  const appClassName = [
    "review-app",
    `review-app--theme-${debugSettings.theme}`,
    `review-app--tint-${debugSettings.nodeTint}`,
  ].join(" ");

  const actionsMenu = (
    <ReviewActionsMenu
      chalkId={document.key}
      settleable={
        !scratchpad && !review.historicalRevision && !review.submissionOutcome
      }
      deletable={!scratchpad}
      onDelete={chrome?.deleteReview}
      overlay={chrome?.overlay}
    />
  );

  // A host with chrome (the desktop command bar) shows these there.
  const viewTabs = (
    <div
      className={cn(
        controlStyles.segmented,
        controlStyles.segmentedTopbar,
        topbarTabsMarker,
      )}
      role="group"
      aria-label="Session views"
    >
      {reviewViews.map((view) => (
        <ButtonPrimitive
          variant="ghost"
          size="xs"
          key={view}
          type="button"
          aria-label={
            view === "map" ? "Map (Experimental)" : reviewViewLabel(view)
          }
          aria-pressed={activeView === view}
          title={view === "map" ? "Map (Experimental)" : undefined}
          className={cn(
            "review-segment",
            segmentMarker,
            controlStyles.segment,
            controlStyles.segmentTopbar,
            activeView === view && controlStyles.segmentActive,
            activeView === view && controlStyles.segmentTopbarActive,
          )}
          onClick={() => {
            showView(view);
          }}
        >
          {view === "review" ? (
            <ReviewSurfaceLabel
              label={scratchpad ? "Scratchpad" : "Chalk"}
              hasContent={document.empty === false}
              active={activeView === "review"}
            />
          ) : (
            <span>{reviewViewLabel(view)}</span>
          )}
          {view === "diff" && filesTabFileCount !== null && (
            <span
              className={cn(
                controlStyles.segmentCount,
                activeView === view && controlStyles.segmentCountActive,
              )}
            >
              {filesTabFileCount}
            </span>
          )}
          {view === "commits" && (
            <span
              className={cn(
                controlStyles.segmentCount,
                activeView === view && controlStyles.segmentCountActive,
              )}
            >
              {commits.length}
            </span>
          )}
          <MarkerUnderline active={activeView === view} />
        </ButtonPrimitive>
      ))}
    </div>
  );

  const topbar = (
    <header
      className={cn(
        shellStyles.topbar,
        activeView === "diff" && "tw:col-span-full",
        chrome && !pageToolbarShown && shellStyles.topbarHidden,
      )}
    >
      <div className={shellStyles.topbarLeft}>
        <div ref={setToolbarStart} className={shellStyles.topbarLeft} />
        {chrome ? createPortal(viewTabs, chrome.views) : viewTabs}
        {chrome && createPortal(actionsMenu, chrome.actions)}
      </div>
      <div className={cn(shellStyles.topbarActions, topbarActionsMarker)}>
        <div className={cn(shellStyles.topbarItem, shellStyles.topbarContext)}>
          <AuthoringActivityBadge
            onLocate={(view) => {
              showView(view);
            }}
          />
        </div>
        <ReviewBatonChip outcome={review.submissionOutcome} />
        <div ref={setToolbarEnd} className="tw:contents" />
        {!chrome && (
          <>
            <div
              className={cn(shellStyles.topbarItem, shellStyles.actionsDivider)}
            />
            {actionsMenu}
          </>
        )}
      </div>
    </header>
  );

  return (
    <PageSlotsContext.Provider value={pageSlots}>
      <div
        ref={appRef}
        className={cn(
          appClassName,
          appMarker,
          themeStyles.vars,
          themeStyles.app,
          activeView === "diff" && shellStyles.diffApp,
          chrome &&
            activeView === "diff" &&
            "tw:border-t tw:border-t-[var(--rule)]",
          debugSettings.theme === "light" && themeStyles.light,
          rightPanelOpen && shellStyles.appPeekOpen,
          sidePeekResize.isResizing && shellStyles.appResizing,
          panelMotion === "restored" && shellStyles.appRestoredPanel,
        )}
        style={appStyle}
        data-peek-open={rightPanelOpen || undefined}
        data-view={activeView}
        data-document-header={document.header || undefined}
        data-database-lens={document.databaseLens || undefined}
        data-document-width={document.width}
      >
        {activeView === "diff" && topbar}
        <main
          ref={shellRef}
          className={cn(
            "review-document-shell",
            shellStyles.documentShell,
            !!banner && shellStyles.documentShellBanner,
            activeView === "diff" &&
              (banner ? shellStyles.diffShellBanner : shellStyles.diffShell),
          )}
        >
          <TutorialExperienceProvider
            shellRef={shellRef}
            scrollRegionRef={scrollRegionRef}
          >
            {activeView !== "diff" && topbar}
            {banner}
            <div ref={setPageOverlay} className="tw:contents" />
            <section
              ref={scrollRegionRef}
              className={cn(
                `review-view-region review-view-region--${activeView}`,
                shellStyles.viewRegion,
                activeView === "commits" && shellStyles.commitsRegion,
                activeView === "review" && shellStyles.reviewRegion,
              )}
            >
              <ChalkPage
                document={document}
                articleRef={articleRef}
                active={activeView === "review"}
                scratchpad={scratchpad}
                peekOpen={rightPanelOpen}
              />
              {softwareMapEnabled && activeView === "map" && (
                <MapPage
                  softwareModels={softwareModels}
                  repoSoftwareMap={repoSoftwareMap}
                  baseSoftwareMap={baseSoftwareMap}
                  softwareMapTopologyDiff={softwareMapTopologyDiff}
                  showFloatingActions={!rightPanelOpen}
                />
              )}
              {activeView === "commits" && (
                <CommitsPage commits={commits} range={range} />
              )}
              <DiffPage active={activeView === "diff"} />
            </section>
          </TutorialExperienceProvider>
        </main>
        {rightPanelOpen && (
          <div
            className={cn(
              shellStyles.resizer,
              activeView !== "diff" && shellStyles.peekResizer,
              shellStyles.resizerGrabPanel,
              sidePeekResize.isResizing && shellStyles.peekResizerActive,
            )}
            {...sidePeekResize.separatorProps}
          />
        )}
        <div className={cn(shellStyles.detailHost, detailHostMarker)}>
          <ReviewPanelHost />
        </div>
      </div>
    </PageSlotsContext.Provider>
  );
}

/**
 * Reports where the baton sits after the reader acts. It renders nothing while
 * the review is simply waiting: the corner action already says what to do, and
 * a standing "awaiting your review" chip was noise on every review.
 */
function ReviewBatonChip({
  outcome,
}: {
  outcome: ReviewSubmissionOutcome | null;
}): ReactElement | null {
  const tooltip = useTooltip<HTMLSpanElement>("Settled");

  if (!outcome) return null;

  return (
    <span
      ref={tooltip}
      className={cn(shellStyles.topbarItem, batonStyles.chip)}
    >
      <Archive className={batonStyles.glyph} size={12} aria-hidden="true" />
      <span>settled</span>
    </span>
  );
}

const batonStyles = {
  chip: "tw:inline-flex tw:items-center tw:gap-[7px] tw:text-[color:var(--diff-removed)] tw:font-[family-name:var(--chrome-font)] tw:text-[length:var(--chrome-font-size-small)] tw:font-[number:var(--chrome-font-weight-strong)] tw:leading-[1] tw:tracking-[var(--chrome-tracking)] tw:uppercase tw:whitespace-nowrap",
  glyph:
    "tw:fill-[none] tw:stroke-[currentColor] tw:[stroke-linecap:round] tw:[stroke-linejoin:round] tw:stroke-[1.4]",
};
