import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canvas/components/ui/popover";
import { Switch } from "@canvas/components/ui/switch";
import { Choice } from "@canvas/settings/settings-choice";
import { Button, IconButton } from "@canvas/ui/button";
import { StatusBanner } from "@canvas/ui/status-banner";
import { textStyles } from "@canvas/ui/text";
import {
  type ReviewCanvasRange,
  type ReviewCommitSummary,
  type ReviewDocumentWidthChoice,
} from "@chalk/review-contracts";
import {
  type SoftwareMapTopologyDiff,
  diffSoftwareMaps,
} from "@review/software-map/software-map-topology-diff";
import * as stylex from "@stylexjs/stylex";
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
import { DiffLayoutControl } from "./diff/diff-layout-control";
import { ReviewDiffView } from "./diff/DiffView";
import { ReviewCommitsView } from "./diff/ReviewCommitsView";
import { useDocumentEmbedScroll } from "./documents/document-embed-scroll";
import { documentStyles } from "./documents/document-styles";
import { ReviewDocumentBoundary } from "./documents/review-document-boundary";
import { reportReviewDocumentRenderError } from "./documents/review-document-error-report";
import { GitLabProvider, useGitLab } from "./gitlab/gitlab-context";
import { GitLabDiscussionPanel } from "./gitlab/gitlab-discussions";
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
  useReviewPanelStore,
  useSuppressPanelMotionOnCanvasResume,
} from "./review/review-panel";
import { type ReviewDiffScope } from "./review/review-panel-store";
import {
  ReviewRootsProvider,
  useReviewContainer,
} from "./review/review-root-context";
import { ReviewToc } from "./review/review-toc";
import {
  offeredReviewViews,
  reviewViewLabel,
} from "./review/review-view-route";
import { useReviewViewStateSync } from "./review/review-view-state";
import { useRightPanelResize } from "./review/side-panel-resizer";
import {
  ReviewDebugSettingsProvider,
  type ReviewNodeTint,
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
} from "./styles/markers.stylex";
import {
  elevation,
  fontSize,
  fontWeight,
  motion,
  radius,
} from "./styles/scale.stylex";
import { shellStyles } from "./styles/shell-styles";
import { withClass } from "./styles/stylex-props";
import { themeStyles } from "./styles/theme-styles";
import { tokens } from "./styles/tokens.stylex";
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
  const panelStore = useReviewPanelStore();

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
            <GitLabProvider>
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
            </GitLabProvider>
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
  const gitlab = useGitLab();
  const review = useReview();
  // The scratchpad is a document and nothing else: no source tree to browse,
  // nothing to dismiss.
  const scratchpad = session.review?.kind === "scratchpad";
  const panelStore = useReviewPanelStore();
  useSuppressPanelMotionOnCanvasResume(appRef);
  const activePanel = useReviewPanel((state) => state.active);
  const panelMotion = useReviewPanel((state) => state.motion);
  const activeView = useReviewPanel((state) => state.view);
  const diffScope = useReviewPanel((state) => state.diffScope);

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

  const mapFocus = useReviewPanel((state) => state.mapFocus);
  const showView = useReviewPanel((state) => state.showView);

  const debugSettings = useReviewDebugSettings();

  const gitlabShown = !!gitlab?.open && activePanel === null;
  const rightPanelOpen = activePanel !== null || gitlabShown;

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
  useReviewViewStateSync({ scrollRegionRef, panelStore });

  // Diagrams only read the open tour, so a restored tour whose diagram is
  // no longer in the document would sit in the store unrendered. The
  // document and its tour overlay commit before this effect runs.
  const canvasRoot = useReviewContainer();
  useEffect(() => {
    const { overlayTour, closeOverlayTour } = panelStore.getState();

    if (overlayTour && !canvasRoot?.querySelector(".diagram-tour-overlay")) {
      closeOverlayTour();
    }
  }, [canvasRoot, documentRevision, panelStore]);

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
    panelStore.getState().setAvailableViews(reviewViews);
  }, [panelStore, reviewViews]);

  const lenses = useReviewLenses();

  const tutorial = useTutorial() !== null;

  const tocEntries = document.tocEntries ?? [];

  // Subscribe before the canvas signals ready so a reveal immediately after
  // mounting cannot outrun the listener.
  useLayoutEffect(() => {
    return session.surface.subscribe((event) => {
      if (event.event !== "showReviewView") return;
      const { availableViews, showView } = panelStore.getState();

      if (availableViews.includes(event.view)) showView(event.view);
    });
  }, [panelStore, session.surface]);

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
      {...withClass(
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
        {...withClass(
          "review-document-shell",
          shellStyles.documentShell,
          !!banner && shellStyles.documentShellBanner,
        )}
      >
        <TutorialExperienceProvider
          shellRef={shellRef}
          scrollRegionRef={scrollRegionRef}
        >
          <header {...stylex.props(shellStyles.topbar)}>
            <div {...stylex.props(shellStyles.topbarLeft, topbarTabsMarker)}>
              <div
                {...stylex.props(
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
                    {...withClass(
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
                        {...stylex.props(
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
                        {...stylex.props(
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
            <div
              {...stylex.props(shellStyles.topbarActions, topbarActionsMarker)}
            >
              <div
                {...stylex.props(
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
              <DiffLayoutControl />
              {gitlab && (
                <Button
                  variant="ghost"
                  xstyle={shellStyles.topbarItem}
                  aria-expanded={gitlabShown}
                  onClick={gitlab.toggle}
                >
                  Discussions
                </Button>
              )}
              {!scratchpad &&
                !review.historicalRevision &&
                !review.submissionOutcome && (
                  <div
                    {...stylex.props(
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
            {...withClass(
              `review-view-region review-view-region--${activeView}`,
              shellStyles.viewRegion,
              activeView === "commits" && shellStyles.commitsRegion,
              activeView === "review" && shellStyles.reviewRegion,
            )}
          >
            <div
              {...withClass(
                "review-document-view",
                shellStyles.documentView,
                activeView !== "review" && shellStyles.hidden,
              )}
              hidden={activeView !== "review"}
            >
              <>
                <article
                  ref={articleRef}
                  {...withClass(
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
                {...withClass(
                  "review-map-view",
                  shellStyles.mapView,
                  mapViewStyles.view,
                )}
              >
                <div
                  {...stylex.props(
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
                    onFocusRequestHandled={
                      panelStore.getState().consumeMapFocus
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
                  panelStore.getState().openCommitDiff({ commit, file });
                }}
              />
            )}
            <div
              ref={diffHostRef}
              aria-hidden={diffPreloaded}
              {...stylex.props(
                shellStyles.diffView,
                diffPreloaded && shellStyles.diffViewPreloaded,
              )}
              style={frozenDiffStyle}
            >
              {diffOpened && <ReviewDiffView />}
            </div>
            {activeView === "diff" && diffScope !== null && (
              <div
                {...withClass(
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
          {...stylex.props(
            shellStyles.resizer,
            shellStyles.peekResizer,
            shellStyles.resizerGrabPanel,
            sidePeekResize.isResizing && shellStyles.peekResizerActive,
          )}
          {...sidePeekResize.separatorProps}
        />
      )}
      <div {...stylex.props(shellStyles.detailHost, detailHostMarker)}>
        {gitlabShown && <GitLabDiscussionPanel />}
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
    <div {...stylex.props(scopeBarStyles.bar)}>
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        type="button"
        {...stylex.props(scopeBarStyles.back)}
        onClick={onBack}
      >
        <ArrowLeft size={12} aria-hidden="true" /> Commits
      </ButtonPrimitive>
      <code {...stylex.props(scopeBarStyles.sha)} title={commit.commit}>
        {commit.commit.slice(0, 8)}
      </code>
      <span {...stylex.props(scopeBarStyles.subject)} title={commit.subject}>
        {commit.subject}
      </span>
    </div>
  );
}

const scopeBarStyles = stylex.create({
  bar: {
    display: "flex",
    height: "30px",
    flex: "0 0 30px",
    alignItems: "center",
    gap: "12px",
    padding: "0 12px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.ruleSoft,
    backgroundColor: tokens.surface,
  },
  back: {
    height: "20px",
    flex: "0 0 auto",
    padding: 0,
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    backgroundColor: "transparent",
    color: tokens.accent,
    fontSize: fontSize.micro,
  },
  sha: {
    color: tokens.inkMuted,
    font: `${fontSize.micro} ${tokens.fontMono}`,
  },
  subject: {
    minWidth: 0,
    overflow: "hidden",
    color: tokens.ink,
    fontSize: fontSize.small,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

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
  const tooltip = useTooltip<HTMLSpanElement>("Dismissed");

  if (!outcome) return null;

  return (
    <span
      ref={tooltip}
      {...stylex.props(shellStyles.topbarItem, batonStyles.chip)}
    >
      <Archive
        {...stylex.props(batonStyles.glyph)}
        size={12}
        aria-hidden="true"
      />
      <span>dismissed</span>
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

const batonStyles = stylex.create({
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    color: tokens.diffRemoved,
    fontFamily: tokens.chromeFont,
    fontSize: tokens.chromeFontSizeSmall,
    fontWeight: tokens.chromeFontWeightStrong,
    lineHeight: 1,
    letterSpacing: tokens.chromeTracking,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  glyph: {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "1.4",
  },
});

// Map settings float over the map canvas instead of sitting behind a topbar
// gear, so map-only controls stay with the map.
const mapViewStyles = stylex.create({
  view: {
    backgroundColor: tokens.bg,
  },
  canvasShell: {
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    borderRadius: 0,
    backgroundColor: tokens.bg,
    boxShadow: "none",
  },
});
