import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canvas/components/ui/popover";
import { Switch } from "@canvas/components/ui/switch";
import { cn } from "@canvas/lib/utils";
import { Choice } from "@canvas/settings/settings-choice";
import { Button, IconButton } from "@canvas/ui/button";
import { CopyButton } from "@canvas/ui/copy-text";
import { ChatIcon } from "@canvas/ui/icons";
import { StatusBanner } from "@canvas/ui/status-banner";
import {
  type ReviewCanvasRange,
  type ReviewCommitSummary,
  type ReviewDocumentWidthChoice,
} from "@chalk/review-contracts";
import {
  type SoftwareMapTopologyDiff,
  diffSoftwareMaps,
} from "@review/software-map/software-map-topology-diff";
import { Archive, ArrowLeft } from "lucide-react";
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

import {
  AgentSelectionProvider,
  useAgentSelection,
} from "./agent-context/agent-selection";
import { observeAgentTextSelection } from "./agent-context/agent-text-selection";
import { CommentsProvider, useComments } from "./comments/comments-context";
import { CommentsPanel } from "./comments/comments-panel";
import { DiffSettingsControl } from "./diff/diff-settings";
import { ReviewDiffView } from "./diff/DiffView";
import { ReviewCommitsView } from "./diff/ReviewCommitsView";
import { useDocumentEmbedScroll } from "./documents/document-embed-scroll";
import { documentStyles } from "./documents/document-styles";
import { ReviewDocumentBoundary } from "./documents/review-document-boundary";
import { reportReviewDocumentRenderError } from "./documents/review-document-error-report";
import { useReviewSession } from "./host/review-session";
import { useTooltip } from "./lib/use-tooltip";
import {
  AuthoringActivityBadge,
  ReviewSurfaceLabel,
} from "./review/authoring-activity";
import { MissingCheckoutBanner } from "./review/missing-checkout-banner";
import { ReviewPanelHost } from "./review/review-components";
import {
  ReviewProvider,
  type ReviewSubmissionOutcome,
  useReview,
} from "./review/review-context";
import { ReviewCornerAction } from "./review/review-corner-action";
import { useReviewDiffFiles } from "./review/review-diff-files-context";
import { ReviewDiffFilesProvider } from "./review/review-diff-files-context";
import {
  type ReviewFindHost,
  ReviewFindProvider,
  useReviewFindRegistration,
} from "./review/review-find";
import { useReviewLenses } from "./review/review-lenses";
import {
  useReviewPanel,
  useReviewPanelActor,
  useSuppressPanelMotionOnCanvasResume,
} from "./review/review-panel";
import {
  ReviewRootsProvider,
  useReviewContainer,
} from "./review/review-root-context";
import { ReviewToc } from "./review/review-toc";
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
import type {
  NormalizedSoftwareElement,
  NormalizedSoftwareModel,
} from "./software-map/model";
import { SoftwareMapTopologyUnavailable } from "./software-map/software-map-absence";
import { selectActiveSoftwareMapModel } from "./software-map/software-map-selection";
import { SoftwareMap } from "./software-map/SoftwareMap";
import { controlStyles } from "./styles/controls-styles";
import {
  appMarker,
  detailHostMarker,
  documentMarker,
  scopedDiffMarker,
  segmentMarker,
  topbarActionsMarker,
  topbarTabsMarker,
} from "./styles/markers";
import { shellStyles } from "./styles/shell-styles";
import { themeStyles } from "./styles/theme-styles";
import { useTutorial } from "./tutorial/tutorial-context";
import { TutorialExperienceProvider } from "./tutorial/tutorial-experience";
import { MarkerUnderline, SettingsSlidersIcon } from "./ui/icons";

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
}: {
  document: RenderedReviewDocument;
  softwareMap: PublishedSoftwareMap;
  softwareMapEnabled: boolean;
  range: ReviewCanvasRange;
  commits: readonly ReviewCommitSummary[];
  findHost?: ReviewFindHost;
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
}: {
  document: RenderedReviewDocument;
  softwareMap: PublishedSoftwareMap;
  softwareMapEnabled: boolean;
  range: ReviewCanvasRange;
  commits: readonly ReviewCommitSummary[];
  findHost?: ReviewFindHost;
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
                  documentRevision={documentRevision}
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
  documentRevision,
  softwareModels,
  repoSoftwareMap,
  baseSoftwareMap,
  softwareMapTopologyDiff,
  softwareMapEnabled,
  range,
  commits,
}: {
  appRef: RefObject<HTMLDivElement | null>;
  shellRef: RefObject<HTMLElement | null>;
  scrollRegionRef: RefObject<HTMLElement | null>;
  articleRef: RefObject<HTMLElement | null>;
  document: RenderedReviewDocument;
  documentRevision: string;
  softwareModels: NormalizedSoftwareModel[];
  repoSoftwareMap: NormalizedSoftwareModel | null;
  baseSoftwareMap: NormalizedSoftwareModel | null;
  softwareMapTopologyDiff: SoftwareMapTopologyDiff | null;
  softwareMapEnabled: boolean;
  range: ReviewCanvasRange;
  commits: readonly ReviewCommitSummary[];
}): ReactElement {
  const session = useReviewSession();
  const comments = useComments();
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

  // The full diff stays mounted while another view shows, at the width it
  // had when it was hidden: following the column through a side peek's
  // resize would lay out every editor in it on each step. Shown, it fills the
  // column again and lays out once.
  const diffHostRef = useRef<HTMLDivElement | null>(null);
  const diffPreloaded = activeView !== "diff" || diffScope !== null;
  // Built the first time it is shown, then kept for instant returns.
  const [diffOpened, setDiffOpened] = useState(!diffPreloaded);

  if (!diffPreloaded && !diffOpened) setDiffOpened(true);

  const [frozenDiffWidth, setFrozenDiffWidth] = useState<number>();

  useLayoutEffect(() => {
    const width = diffHostRef.current?.getBoundingClientRect().width;

    setFrozenDiffWidth(diffPreloaded && width ? width : undefined);
  }, [diffPreloaded]);

  const frozenDiffStyle =
    diffPreloaded && frozenDiffWidth
      ? { right: "auto", width: `${frozenDiffWidth}px` }
      : undefined;

  const mapFocus = useReviewPanel((state) => state.context.mapFocus);

  const showView = (view: ReviewView) =>
    panelActor.send({ type: "showView", view });

  const debugSettings = useReviewDebugSettings();

  const commentsShown = !!comments?.open && activePanel === null;
  const rightPanelOpen = activePanel !== null || commentsShown;

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

  // Diagrams only read the open tour, so a restored tour whose diagram is
  // no longer in the document would sit in the store unrendered. The
  // document and its tour overlay commit before this effect runs.
  const canvasRoot = useReviewContainer();
  useEffect(() => {
    const { overlayTour } = panelActor.getSnapshot().context;

    if (overlayTour && !canvasRoot?.querySelector(".diagram-tour-overlay")) {
      panelActor.send({ type: "closeOverlayTour" });
    }
  }, [canvasRoot, documentRevision, panelActor]);

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
  useEffect(() => {
    const article = articleRef.current;

    if (activeView !== "review" || !article) return;

    return observeAgentTextSelection(article, selectForAgent);
  }, [activeView, documentRevision, articleRef, selectForAgent]);

  const reviewFind = useReviewFindRegistration();
  useEffect(() => {
    reviewFind?.setReviewActive(activeView === "review");
  }, [activeView, reviewFind]);

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

  const lenses = useReviewLenses();

  const tutorial = useTutorial() !== null;

  const tocEntries = document.tocEntries ?? [];

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

  const activeSoftwareMapSource = useMemo(
    () =>
      selectActiveSoftwareMapModel({
        softwareModels,
        focusElementPath: mapFocus?.elementPath,
      }),
    [mapFocus?.elementPath, softwareModels],
  );

  const activeSoftwareMap = useMemo(
    () =>
      applySoftwareMapTopologyStatuses(
        activeSoftwareMapSource,
        softwareMapTopologyDiff,
      ),
    [activeSoftwareMapSource, softwareMapTopologyDiff],
  );

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

  return (
    <div
      ref={appRef}
      className={cn(
        appClassName,
        appMarker,
        themeStyles.vars,
        themeStyles.app,
        debugSettings.theme === "light" && themeStyles.light,
        rightPanelOpen && shellStyles.appPeekOpen,
        sidePeekResize.isResizing && shellStyles.appResizing,
        panelMotion === "restored" && shellStyles.appRestoredPanel,
      )}
      style={appStyle}
      data-peek-open={rightPanelOpen || undefined}
      data-document-header={document.header || undefined}
      data-database-lens={document.databaseLens || undefined}
      data-document-width={document.width}
    >
      <main
        ref={shellRef}
        className={cn(
          "review-document-shell",
          shellStyles.documentShell,
          !!banner && shellStyles.documentShellBanner,
        )}
      >
        <TutorialExperienceProvider
          shellRef={shellRef}
          scrollRegionRef={scrollRegionRef}
        >
          <header className={shellStyles.topbar}>
            <div className={cn(shellStyles.topbarLeft, topbarTabsMarker)}>
              <div
                className={cn(
                  controlStyles.segmented,
                  controlStyles.segmentedTopbar,
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
                      view === "map"
                        ? "Map (Experimental)"
                        : reviewViewLabel(view)
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
                          activeView === view &&
                            controlStyles.segmentCountActive,
                        )}
                      >
                        {filesTabFileCount}
                      </span>
                    )}
                    {view === "commits" && (
                      <span
                        className={cn(
                          controlStyles.segmentCount,
                          activeView === view &&
                            controlStyles.segmentCountActive,
                        )}
                      >
                        {commits.length}
                      </span>
                    )}
                    <MarkerUnderline active={activeView === view} />
                  </ButtonPrimitive>
                ))}
              </div>
            </div>
            <div className={cn(shellStyles.topbarActions, topbarActionsMarker)}>
              <div
                className={cn(
                  shellStyles.topbarItem,
                  shellStyles.topbarContext,
                )}
              >
                <AuthoringActivityBadge
                  onLocate={(view) => {
                    showView(view);
                  }}
                />
              </div>
              <ReviewBatonChip outcome={review.submissionOutcome} />
              <CopyButton
                text={document.key}
                label="Copy Chalk ID"
                className={shellStyles.topbarItem}
                iconClassName={controlStyles.chromeIcon}
              />
              <DiffSettingsControl />
              {comments && (
                <CommentsButton
                  expanded={commentsShown}
                  onClick={comments.toggle}
                />
              )}
              {!scratchpad &&
                !review.historicalRevision &&
                !review.submissionOutcome && (
                  <div
                    className={cn(
                      shellStyles.topbarItem,
                      shellStyles.actionsDivider,
                    )}
                  />
                )}
              {!scratchpad &&
              !review.historicalRevision &&
              !review.submissionOutcome ? (
                <ReviewCornerAction />
              ) : null}
            </div>
          </header>
          {banner}
          {activeView === "review" && (
            <ReviewToc
              entries={tocEntries}
              besideHeader={document.header}
              documentWidth={document.width}
            />
          )}
          <section
            ref={scrollRegionRef}
            className={cn(
              `review-view-region review-view-region--${activeView}`,
              shellStyles.viewRegion,
              activeView === "commits" && shellStyles.commitsRegion,
              activeView === "review" && shellStyles.reviewRegion,
            )}
          >
            <div
              className={cn(
                "review-document-view",
                shellStyles.documentView,
                activeView !== "review" && shellStyles.hidden,
              )}
              hidden={activeView !== "review"}
            >
              <>
                <article
                  ref={articleRef}
                  className={cn(
                    "review-document",
                    documentStyles.article,
                    documentMarker,
                    rightPanelOpen && documentStyles.articlePeekOpen,
                  )}
                  data-kind={scratchpad ? "scratchpad" : undefined}
                >
                  <ReviewDocumentBoundary
                    key={documentRevision}
                    revision={documentRevision}
                    onError={(_revision, error) =>
                      reportReviewDocumentRenderError(session, error)
                    }
                  >
                    <document.render />
                  </ReviewDocumentBoundary>
                </article>
              </>
            </div>
            {softwareMapEnabled && activeView === "map" && (
              <div
                className={cn(
                  "review-map-view",
                  shellStyles.mapView,
                  mapViewStyles.view,
                )}
              >
                <div
                  className={cn(
                    shellStyles.mapCanvasShell,
                    mapViewStyles.canvasShell,
                  )}
                >
                  <SoftwareMapTopologyUnavailable
                    repoSoftwareMap={repoSoftwareMap}
                    baseSoftwareMap={baseSoftwareMap}
                    baseRef={review.resolvedBaseRef ?? undefined}
                    headRef={review.resolvedHeadRef ?? undefined}
                  />
                  <SoftwareMap
                    model={activeSoftwareMap ?? undefined}
                    pinnedData={
                      activeSoftwareMapSource
                        ? session.softwareMapData?.(activeSoftwareMapSource)
                        : undefined
                    }
                    focusRequest={mapFocus?.pending ? mapFocus : null}
                    onFocusRequestHandled={(requestId) =>
                      panelActor.send({ type: "consumeMapFocus", requestId })
                    }
                    height="100%"
                    showChrome={false}
                    showFloatingActions={!rightPanelOpen}
                    variant="view"
                  />
                  <MapSettingsControl />
                </div>
              </div>
            )}
            {activeView === "commits" && (
              <ReviewCommitsView
                commits={commits}
                range={range}
                onOpenDiff={(commit, file) => {
                  panelActor.send({
                    type: "openCommitDiff",
                    scope: { commit, file },
                  });
                }}
              />
            )}
            <div
              ref={diffHostRef}
              aria-hidden={diffPreloaded}
              className={cn(
                shellStyles.diffView,
                diffPreloaded && shellStyles.diffViewPreloaded,
              )}
              style={frozenDiffStyle}
            >
              {diffOpened && <ReviewDiffView />}
            </div>
            {activeView === "diff" && diffScope !== null && (
              <div
                className={cn(
                  "review-diff-view--scoped",
                  shellStyles.diffView,
                  shellStyles.diffViewScoped,
                  scopedDiffMarker,
                )}
              >
                <CommitDiffScopeBar
                  commit={diffScope.commit}
                  onBack={() => showView("commits")}
                />
                <ReviewDiffView
                  scope={{ commit: diffScope.commit.commit }}
                  revealFile={diffScope.file}
                  restoreFile={diffScope.restoreFile}
                />
              </div>
            )}
          </section>
        </TutorialExperienceProvider>
      </main>
      {rightPanelOpen && (
        <div
          className={cn(
            shellStyles.resizer,
            shellStyles.peekResizer,
            shellStyles.resizerGrabPanel,
            sidePeekResize.isResizing && shellStyles.peekResizerActive,
          )}
          {...sidePeekResize.separatorProps}
        />
      )}
      <div className={cn(shellStyles.detailHost, detailHostMarker)}>
        {commentsShown && <CommentsPanel />}
        <ReviewPanelHost />
      </div>
    </div>
  );
}

function CommitDiffScopeBar({
  commit,
  onBack,
}: {
  commit: ReviewCommitSummary;
  onBack: () => void;
}) {
  return (
    <div className={scopeBarStyles.bar}>
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        type="button"
        className={scopeBarStyles.back}
        onClick={onBack}
      >
        <ArrowLeft size={12} aria-hidden="true" /> Commits
      </ButtonPrimitive>
      <code className={scopeBarStyles.sha} title={commit.commit}>
        {commit.commit.slice(0, 8)}
      </code>
      <span className={scopeBarStyles.subject} title={commit.subject}>
        {commit.subject}
      </span>
    </div>
  );
}

const scopeBarStyles = {
  bar: "tw:flex tw:h-[30px] tw:flex-[0_0_30px] tw:items-center tw:gap-[12px] tw:p-[0_12px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule-soft)] tw:bg-[color:var(--surface)]",
  back: "tw:h-[20px] tw:flex-[0_0_auto] tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:transparent] tw:text-[color:var(--accent)] tw:text-[length:10px]",
  sha: "tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-mono)] tw:text-[length:10px] tw:font-normal tw:leading-[normal]",
  subject:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--ink)] tw:text-[length:11px] tw:text-ellipsis tw:whitespace-nowrap",
};

/**
 * Reports where the baton sits after the reader acts. It renders nothing while
 * the review is simply waiting: the corner action already says what to do, and
 * a standing "awaiting your review" chip was noise on every review.
 */
function CommentsButton({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick(): void;
}): ReactElement {
  const tooltip = useTooltip("Comments");

  return (
    <IconButton
      ref={tooltip}
      className={shellStyles.topbarItem}
      aria-label="Comments"
      aria-expanded={expanded}
      onClick={onClick}
    >
      <ChatIcon className={controlStyles.chromeIcon} />
    </IconButton>
  );
}

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

/**
 * Map settings, floating over the map canvas. They used to sit behind a topbar
 * gear that held nothing else, which put map-only controls in front of readers
 * who never open the map.
 */
function MapSettingsControl(): ReactElement {
  const {
    showModifiedOnly,
    setShowModifiedOnly,
    showRemovedNodes,
    setShowRemovedNodes,
    nodeTint,
    setNodeTint,
  } = useReviewDebugSettings();

  const controlRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div ref={controlRef} className="tw:absolute tw:right-4 tw:bottom-4 tw:z-3">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <IconButton
            size="large"
            className="tw:rounded-lg tw:border tw:border-input tw:bg-[var(--tray)] tw:shadow-md"
            aria-label="Map settings"
          >
            <SettingsSlidersIcon />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent
          container={
            controlRef.current?.closest<HTMLElement>(".review-app") ??
            controlRef.current
          }
          align="end"
          side="top"
          aria-label="Map settings"
          className="tw:w-[268px] tw:p-0"
        >
          <DebugSwitch
            label="Show modified nodes only"
            checked={showModifiedOnly}
            onChange={setShowModifiedOnly}
          />
          <DebugSwitch
            label="Show removed nodes"
            checked={showRemovedNodes}
            onChange={setShowRemovedNodes}
          />
          <div className="tw:grid tw:gap-2 tw:p-2.5">
            <span className="tw:text-xs tw:font-semibold tw:text-muted-foreground">
              Map node tint
            </span>
            <Choice
              label="Node tint"
              value={nodeTint}
              labels={{ none: "None", slate: "Slate", mineral: "Mineral" }}
              disabled={false}
              onChange={setNodeTint}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DebugSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <div className="tw:flex tw:min-h-[50px] tw:items-center tw:justify-between tw:gap-3.5 tw:border-b tw:border-border tw:px-3 tw:py-2.5 tw:text-[13px]">
      <span>{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function applySoftwareMapTopologyStatuses(
  model: NormalizedSoftwareModel | undefined,
  diff: SoftwareMapTopologyDiff | null,
): NormalizedSoftwareModel | undefined {
  if (!model || !diff) return model;

  const elements = model.elements.map((element): NormalizedSoftwareElement => {
    const topologyStatus = diff.elementStatusByPath[element.path];

    return topologyStatus
      ? { ...element, changeStatus: topologyStatus }
      : element;
  });

  return {
    ...model,
    elements,
    elementsByPath: new Map(elements.map((element) => [element.path, element])),
  };
}

const batonStyles = {
  chip: "tw:inline-flex tw:items-center tw:gap-[7px] tw:text-[color:var(--diff-removed)] tw:font-[family-name:var(--chrome-font)] tw:text-[length:var(--chrome-font-size-small)] tw:font-[number:var(--chrome-font-weight-strong)] tw:leading-[1] tw:tracking-[var(--chrome-tracking)] tw:uppercase tw:whitespace-nowrap",
  glyph:
    "tw:fill-[none] tw:stroke-[currentColor] tw:[stroke-linecap:round] tw:[stroke-linejoin:round] tw:stroke-[1.4]",
};

// Map settings float over the map canvas instead of sitting behind a topbar
// gear, so map-only controls stay with the map.
const mapViewStyles = {
  view: "tw:bg-[color:var(--bg)]",
  canvasShell:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:rounded-none tw:bg-[color:var(--bg)] tw:[box-shadow:none]",
};
