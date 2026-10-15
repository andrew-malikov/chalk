import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import {
  Courier,
  LensCursorContext,
  lensRowElement,
} from "@canvas/drawing/courier";
import { drawMotion } from "@canvas/drawing/draw-motion.stylex";
import { type MotionPhase, withErasedBlocks } from "@canvas/drawing/draw-queue";
import { useMotionPhases } from "@canvas/drawing/draw-queue-provider";
import { drawStyles } from "@canvas/drawing/draw-styles";
import { useReviewSession } from "@canvas/host/review-session";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { AuthoringActivityContext } from "@canvas/review/authoring-activity-context";
import { scopeLive } from "@canvas/review/authoring-cursor";
import { useReviewDiffFiles } from "@canvas/review/review-diff-files-context";
import { useReviewLenses } from "@canvas/review/review-lenses";
import {
  useBottomSheetResize,
  useRightPanelResize,
} from "@canvas/review/side-panel-resizer";
import {
  diffWorkspaceMarker,
  lensToggleMarker,
  scopedDiffMarker,
} from "@canvas/styles/markers.stylex";
import {
  fontSize,
  fontWeight,
  motion,
  radius,
} from "@canvas/styles/scale.stylex";
import { shellStyles } from "@canvas/styles/shell-styles";
import { withClass } from "@canvas/styles/stylex-props";
import { tokens } from "@canvas/styles/tokens.stylex";
import { IconButton } from "@canvas/ui/button";
import { textStyles } from "@canvas/ui/text";
import type {
  ReviewCommitScope,
  ReviewDiffLens,
  ReviewDiffProgress,
} from "@chalk/review-contracts";
import type { Lens } from "@review/documents/diff-lenses";
import {
  type CoverageProgress,
  coverageProgress,
  coverageSources,
} from "@review/documents/viewed-coverage";
import * as stylex from "@stylexjs/stylex";
import {
  File,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Search,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { compactDiffCount, diffCountStyles } from "./diff-count";
import { PierreDiffView } from "./PierreDiffView";
import { ViewedButton } from "./viewed-button";

// An empty label shows no tooltip, so only a truncated name gets one.
function LensName({ title, phase }: { title: string; phase?: MotionPhase }) {
  const [truncated, setTruncated] = useState(false);

  const tooltip = useTooltip<HTMLSpanElement>(truncated ? title : "", {
    instant: true,
  });

  const ref = useCallback(
    (name: HTMLSpanElement | null) => {
      if (!name || typeof ResizeObserver === "undefined") return tooltip(name);

      const observer = new ResizeObserver(() =>
          setTruncated(name.scrollWidth > name.clientWidth),
        ),
        disposeTooltip = tooltip(name);

      observer.observe(name);

      return () => {
        observer.disconnect();
        disposeTooltip?.();
      };
    },
    [tooltip],
  );

  return (
    <span
      ref={ref}
      {...stylex.props(styles.name, phase === "relabel" && styles.nameRelabel)}
    >
      {title}
    </span>
  );
}

export function DiffCounts({
  progress,
  xstyle,
}: {
  progress: CoverageProgress;
  xstyle?: stylex.StyleXStyles;
}) {
  const { remaining, total, folded } = progress;

  const tooltip = useTooltip<HTMLSpanElement>(
    `+${remaining.additions} −${remaining.deletions} remaining`,
    {
      instant: true,
      detail: `of +${total.additions} −${total.deletions} total${folded.additions + folded.deletions ? ` · +${folded.additions} −${folded.deletions} folded` : ""}`,
    },
  );

  return (
    <span
      ref={tooltip}
      {...stylex.props(
        diffCountStyles.counts,
        (progress.state === "viewed" || progress.state === "folded") &&
          styles.faded,
        xstyle,
      )}
    >
      {progress.state === "viewed" ? (
        "Viewed"
      ) : progress.state === "folded" ? (
        "Folded"
      ) : (
        <>
          <span {...stylex.props(diffCountStyles.added)}>
            +{compactDiffCount(remaining.additions)}
          </span>
          <span {...stylex.props(diffCountStyles.removed)}>
            −{compactDiffCount(remaining.deletions)}
          </span>
        </>
      )}
    </span>
  );
}

export function ReviewDiffView({
  scope,
  revealFile,
  restoreFile,
}: {
  scope?: ReviewCommitScope;
  /** The path of a file to scroll to once the diff loads. */
  revealFile?: string;
  /** A saved diff position wins over `revealFile`. */
  restoreFile?: boolean;
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const cabinetsRef = useRef<HTMLDivElement>(null);

  const sidebarResize = useRightPanelResize({
    side: "left",
    stateKey: "diff-sidebar-width",
    defaultWidth: 320,
    minWidth: 250,
    maxWidth: 800,
    minMainWidth: 320,
    collapsedWidth: 44,
    label: "Resize diff sidebar",
    containerRef: workspaceRef,
  });

  const cabinetsResize = useBottomSheetResize({
    stateKey: "diff-files-height",
    defaultFraction: 0.45,
    minFraction: 0.2,
    maxFraction: 0.8,
    label: "Resize lenses and files",
    containerRef: cabinetsRef,
  });

  const lenses = useReviewLenses();
  const diffFiles = useReviewDiffFiles();
  const lens = scope ? undefined : lenses?.active;
  const [lensList, setLensList] = useState<HTMLDivElement | null>(null);
  const rows = useLensRows(lenses?.lenses ?? []);
  const lensCursor = useContext(LensCursorContext);

  const lensesLive = scopeLive(useContext(AuthoringActivityContext), "lenses");
  const [fullTree, setFullTree] = useState<HTMLDivElement | null>(null);
  const [lensTree, setLensTree] = useState<HTMLDivElement | null>(null);

  const fullProgress = useMemo(
    () =>
      lenses?.progress
        ? {
            files: lenses.progress.files.map((file) => ({
              path: file.path,
              ...coverageProgress([file]),
              viewedRanges: coverageSources(file),
              changedRanges: coverageSources(file, file.changed),
              unfoldRanges: lenses.unfoldRanges.filter(
                (source) =>
                  source.file ===
                  (source.side === "base"
                    ? (file.previousPath ?? file.path)
                    : file.path),
              ),
            })),
            changedPaths: lenses.changedPaths,
          }
        : undefined,
    [lenses?.progress, lenses?.changedPaths, lenses?.unfoldRanges],
  );

  const lensProgress = useMemo(
    () =>
      lenses?.progress && lens
        ? {
            files: lenses.progress.files.map((file) => ({
              path: file.path,
              ...coverageProgress([file], lens.ranges),
              viewedRanges: coverageSources(file),
              changedRanges: coverageSources(file, file.changed),
              unfoldRanges: lenses.unfoldRanges.filter(
                (source) =>
                  source.file ===
                  (source.side === "base"
                    ? (file.previousPath ?? file.path)
                    : file.path),
              ),
            })),
            changedPaths: lenses.changedPaths,
          }
        : undefined,
    [lenses?.progress, lenses?.changedPaths, lenses?.unfoldRanges, lens],
  );

  const markFile = (path: string, scoped: boolean) => {
    const file = lenses?.progress?.files.find((file) => file.path === path);

    if (!file || !lenses) return;

    const sources = scoped
      ? lens?.ranges.filter(
          (source) =>
            source.file ===
            (source.side === "base"
              ? (file.previousPath ?? file.path)
              : file.path),
        )
      : coverageSources(file, file.changed);

    void lenses.mark(sources, lenses.stats(sources).state !== "viewed");
  };

  if (diffFiles.status === "unavailable") return null;

  if (scope || !lenses)
    return (
      <PierreDiffView
        scope={scope}
        revealFile={revealFile}
        restoreFile={restoreFile}
      />
    );
  const global = lenses.stats();

  // diff-workspace is a marker global.css keys on.
  return (
    <div
      {...withClass("diff-workspace", styles.workspace, diffWorkspaceMarker)}
      ref={workspaceRef}
    >
      {sidebarResize.collapsed && (
        <DiffRail
          rows={rows}
          lenses={lenses}
          activeId={lens?.id}
          onExpand={sidebarResize.expand}
        />
      )}
      {/* Stays mounted while folded: it hosts the diff views' file trees. */}
      <aside
        {...stylex.props(
          styles.sidebar,
          sidebarResize.collapsed && styles.hidden,
        )}
        style={{ width: sidebarResize.width }}
      >
        <div {...stylex.props(styles.progress)}>
          <span {...stylex.props(styles.progressLabel)}>
            {lenses.error &&
            !(lenses.progress && lenses.progress.complete !== false) ? (
              "Counts unavailable"
            ) : (
              <>
                Remaining{" "}
                {lenses.progress && lenses.progress.complete !== false ? (
                  <DiffCounts progress={global} />
                ) : (
                  <span
                    {...stylex.props(diffCountStyles.counts)}
                    aria-label="Counting changes"
                  >
                    …
                  </span>
                )}
              </>
            )}
          </span>
          <div {...stylex.props(styles.progressActions)}>
            <IconButton
              aria-label="Collapse diff sidebar"
              title="Collapse diff sidebar"
              xstyle={styles.sidebarAction}
              onClick={sidebarResize.collapse}
            >
              <PanelLeftCloseIcon aria-hidden="true" />
            </IconButton>
          </div>
        </div>
        <div {...stylex.props(styles.cabinets)} ref={cabinetsRef}>
          <div
            {...withClass("diff-sidebar-lenses", styles.lenses)}
            aria-label="Lenses"
            ref={setLensList}
            style={{ flexBasis: `${(1 - cabinetsResize.fraction) * 100}%` }}
          >
            <div
              {...stylex.props(
                textStyles.eyebrow,
                styles.heading,
                styles.lensesHeading,
              )}
            >
              Lenses
            </div>
            {rows.items.map((item) => {
              const selected = lens?.id === item.id,
                stats = lenses.stats(item.sources),
                phase = rows.phases.get(item.id),
                // Nothing to filter to, so the row greys out; a lens already
                // selected can still be cleared.
                empty = !item.pending && item.fileCount === 0;

              return (
                <section
                  key={item.id}
                  {...stylex.props(
                    styles.section,
                    selected && styles.sectionExpanded,
                    phase && sectionMotionStyle(phase),
                  )}
                  data-lens-id={item.id}
                  data-motion={phase}
                >
                  <div
                    {...stylex.props(
                      styles.row,
                      phase === "landing" && drawStyles.rowLanding,
                      phase === "erasing" && drawStyles.rowErasing,
                    )}
                  >
                    <ButtonPrimitive
                      variant="ghost"
                      size="xs"
                      {...withClass(
                        "tw:h-auto tw:whitespace-normal tw:font-normal",
                        lensToggleMarker,
                        styles.toggle,
                        empty && styles.toggleEmpty,
                        selected && styles.toggleActive,
                        stats.state === "viewed" && !selected && styles.faded,
                      )}
                      aria-pressed={selected}
                      disabled={!!item.unavailable || (empty && !selected)}
                      onClick={() =>
                        selected ? lenses.clear() : lenses.select(item.id)
                      }
                    >
                      {/* The title sits on the chip, not the toggle, so it
                          never stacks on the counts' own tooltip. */}
                      <span
                        {...stylex.props(
                          styles.chip,
                          selected && styles.chipActive,
                        )}
                        title={
                          item.unavailable ??
                          (selected ? "Clear lens filter" : undefined)
                        }
                      >
                        <LensName title={item.title} phase={phase} />
                        {selected && (
                          <span
                            {...stylex.props(styles.clear)}
                            aria-hidden="true"
                          >
                            <X
                              size={10}
                              {...stylex.props(styles.clearMark)}
                              aria-hidden="true"
                            />
                          </span>
                        )}
                      </span>
                      {item.pending ? (
                        <span
                          {...stylex.props(
                            diffCountStyles.counts,
                            styles.toggleCounts,
                          )}
                          aria-label="Counting changes"
                        >
                          …
                        </span>
                      ) : empty ? (
                        <span
                          {...stylex.props(
                            diffCountStyles.counts,
                            styles.toggleCounts,
                          )}
                        >
                          0 files
                        </span>
                      ) : stats.state === "viewed" ? null : (
                        // The checkbox beside it already says viewed.
                        <DiffCounts
                          progress={stats}
                          xstyle={styles.toggleCounts}
                        />
                      )}
                    </ButtonPrimitive>
                    <ViewedButton
                      progress={stats}
                      disabled={
                        lenses.busy || !!item.unavailable || !!item.pending
                      }
                      label={item.title}
                      onClick={() =>
                        void lenses.mark(
                          item.sources,
                          stats.state !== "viewed",
                          selected,
                        )
                      }
                    />
                  </div>
                </section>
              );
            })}
            <Courier
              scope="lenses"
              container={lensList}
              find={lensRowElement}
            />
          </div>
          <div
            {...cabinetsResize.separatorProps}
            {...stylex.props(
              shellStyles.sheetResizer,
              styles.cabinetsResizer,
              cabinetsResize.isResizing && styles.resizing,
            )}
          />
          <div {...stylex.props(styles.files)}>
            <div
              {...stylex.props(
                textStyles.eyebrow,
                styles.heading,
                styles.filesHeading,
              )}
            >
              Files <span aria-hidden="true">·</span>{" "}
              {lenses.progress
                ? lens
                  ? new Set(
                      lens.ranges.map(
                        (source) =>
                          lenses.progress!.files.find(
                            (file) =>
                              source.file ===
                              (source.side === "base"
                                ? (file.previousPath ?? file.path)
                                : file.path),
                          )?.path ?? source.file,
                      ),
                    ).size + ` of ${lenses.progress.files.length}`
                  : lenses.progress.files.length
                : "…"}
            </div>
            <div
              {...withClass("diff-native-tree", styles.nativeTree)}
              ref={setFullTree}
              style={lens ? { display: "none" } : undefined}
            />
            <div
              {...withClass("diff-native-tree", styles.nativeTree)}
              ref={setLensTree}
              style={!lens ? { display: "none" } : undefined}
            />
          </div>
        </div>
      </aside>
      <div
        {...sidebarResize.separatorProps}
        {...stylex.props(
          shellStyles.resizer,
          styles.sidebarResizer,
          sidebarResize.collapsed && styles.railResizer,
          sidebarResize.isResizing && styles.resizing,
        )}
      />
      <div {...stylex.props(styles.editor)}>
        {fullTree && (
          <PierreDiffView
            treeContainer={fullTree}
            progress={fullProgress}
            onToggleViewed={(path) => markFile(path, false)}
            hidden={!!lens}
            inWorkspace
          />
        )}
        {lens && lensTree && (
          <PierreDiffView
            lens={lens}
            treeContainer={lensTree}
            progress={lensProgress}
            onToggleViewed={(path) => markFile(path, true)}
            inWorkspace
          />
        )}
        {lenses.error && (
          <div {...stylex.props(styles.error)} role="alert">
            {lenses.error}
          </div>
        )}
      </div>
    </div>
  );
}

/** The lens rows on screen: the current lenses plus a removed one while the
 * lens draw queue erases it, and each row's phase. */
function useLensRows<Item extends { id: string }>(items: Item[]) {
  const phases = useMotionPhases("lenses");
  const previous = useRef(items);
  const shown = withErasedBlocks(items, previous.current, phases);

  useEffect(() => {
    previous.current = shown;
  });

  return { items: shown, phases };
}

type ReviewLenses = NonNullable<ReturnType<typeof useReviewLenses>>;

type LensItem = ReviewLenses["lenses"][number];

function DiffRail({
  rows,
  lenses,
  activeId,
  onExpand,
}: {
  rows: { items: LensItem[]; phases: Map<string, MotionPhase> };
  lenses: ReviewLenses;
  activeId: string | undefined;
  onExpand: () => void;
}) {
  return (
    <nav {...stylex.props(styles.rail)} aria-label="Lens rail">
      <div {...stylex.props(styles.railProgress)}>
        <RailButton label="Expand diff sidebar" onClick={onExpand}>
          <PanelLeftOpenIcon size={16} aria-hidden="true" />
        </RailButton>
      </div>
      <RailButton label="Show lenses" onClick={onExpand}>
        <MagnifierIcon />
      </RailButton>
      {rows.items.map((item, index) => (
        <RailLens
          key={item.id}
          item={item}
          number={index + 1}
          lenses={lenses}
          selected={activeId === item.id}
          phase={rows.phases.get(item.id)}
        />
      ))}
      <div {...stylex.props(styles.railFiles)}>
        <RailButton label="Show files" onClick={onExpand}>
          <FileIcon />
        </RailButton>
      </div>
    </nav>
  );
}

function RailLens({
  item,
  number,
  lenses,
  selected,
  phase,
}: {
  item: LensItem;
  number: number;
  lenses: ReviewLenses;
  selected: boolean;
  phase: MotionPhase | undefined;
}) {
  const stats = lenses.stats(item.sources),
    empty = !item.pending && item.fileCount === 0;

  // On the name: disabled buttons get no pointer events.
  const tooltip = useTooltip<HTMLSpanElement>(item.title, {
    instant: true,
    detail: item.pending ? undefined : empty ? "0 files" : countsLabel(stats),
  });

  return (
    <ButtonPrimitive
      variant="ghost"
      size="xs"
      {...withClass(
        "tw:h-auto tw:whitespace-normal tw:font-normal",
        styles.railLens,
        empty && styles.toggleEmpty,
        selected && styles.railLensActive,
        stats.state === "viewed" && !selected && styles.faded,
        phase && sectionMotionStyle(phase),
      )}
      aria-label={item.title}
      aria-pressed={selected}
      disabled={!!item.unavailable || (empty && !selected)}
      onClick={() => (selected ? lenses.clear() : lenses.select(item.id))}
    >
      <span ref={tooltip}>{number}</span>
    </ButtonPrimitive>
  );
}

function countsLabel({ state, remaining }: CoverageProgress) {
  return state === "viewed"
    ? "Viewed"
    : state === "folded"
      ? "Folded"
      : `+${remaining.additions} −${remaining.deletions} remaining`;
}

function RailButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const tooltip = useTooltip(label, { instant: true });

  return (
    <ButtonPrimitive
      variant="ghost"
      size="xs"
      ref={tooltip}
      {...withClass(
        "tw:h-auto tw:whitespace-normal tw:font-normal",
        styles.railButton,
      )}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </ButtonPrimitive>
  );
}

function FileIcon() {
  return <File {...stylex.props(styles.icon)} size={14} aria-hidden="true" />;
}

function MagnifierIcon() {
  return <Search {...stylex.props(styles.icon)} size={14} aria-hidden="true" />;
}

// The lens list draws like the document: a new row lands in a slot and wipes
// in, a retitle recomposes the name, a removed row is erased and the list
// closes over it. Reduced motion shows each phase's finished frame. The row's
// wipe and erase share the document's keyframes in draw-styles.ts.
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";

const REDUCED = "@media (prefers-reduced-motion: reduce)";

const landSlot = stylex.keyframes({
  "0%": {
    outline: `1px dashed ${tokens.ruleSoft}`,
    outlineOffset: "-1px",
    backgroundColor: tokens.transparent,
  },
  "38%": {
    outline: `1px solid ${tokens.accent}`,
    outlineOffset: "-1px",
    backgroundColor: tokens.markerTint,
  },
  "70%": {
    outline: `1px solid ${tokens.accent}`,
    backgroundColor: tokens.markerTint,
  },
  "100%": {
    outline: `1px solid ${tokens.transparent}`,
    outlineOffset: "-1px",
    backgroundColor: tokens.transparent,
  },
});

const attention = stylex.keyframes({
  from: {
    outlineColor: tokens.transparent,
    backgroundColor: tokens.transparent,
  },
});

const collapse = stylex.keyframes({
  from: { height: "auto", marginBlock: 0 },
  to: { height: 0, marginBlock: 0 },
});

const relabel = stylex.keyframes({
  from: { opacity: 0, clipPath: "inset(0 100% 0 0)" },
  to: { opacity: 1, clipPath: "inset(0 0 0 0)" },
});

const inScopedDiff = () => stylex.when.ancestor(":is(*)", scopedDiffMarker);

const styles = stylex.create({
  workspace: {
    display: "flex",
    minHeight: 0,
    height: "100%",
    color: tokens.ink,
    font: `${fontSize.small}/1.5 ${tokens.fontSans}`,
  },
  // The sidebar is the tray; its right padding holds the divider.
  sidebar: {
    width: "320px",
    minWidth: "250px",
    flexShrink: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    paddingRight: "16px",
    backgroundColor: tokens.tray,
  },
  hidden: {
    display: "none",
  },
  rail: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    flexShrink: 0,
    width: "44px",
    paddingBottom: "8px",
    overflowX: "hidden",
    overflowY: "auto",
    backgroundColor: tokens.tray,
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: tokens.rule,
  },
  railProgress: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    alignSelf: "stretch",
    flexShrink: 0,
    minHeight: "52px",
    paddingBlock: "8px",
    marginBottom: "2px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.rule,
    color: tokens.inkMuted,
  },
  railButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "28px",
    height: "28px",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    borderRadius: radius.control,
    padding: 0,
    color: tokens.inkMuted,
    cursor: "pointer",
    backgroundColor: { default: "transparent", ":hover": tokens.well },
    outline: { default: null, ":focus-visible": `1px solid ${tokens.accent}` },
    outlineOffset: { default: null, ":focus-visible": "-2px" },
  },
  railLens: {
    flexShrink: 0,
    boxSizing: "border-box",
    width: "28px",
    height: "24px",
    padding: 0,
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    borderRadius: radius.pill,
    font: "inherit",
    color: "inherit",
    textAlign: "center",
    whiteSpace: "nowrap",
    cursor: "pointer",
    backgroundColor: { default: "transparent", ":hover": tokens.well },
    outline: { default: null, ":focus-visible": `1px solid ${tokens.accent}` },
    outlineOffset: { default: null, ":focus-visible": "-2px" },
  },
  railLensActive: {
    color: tokens.ink,
    fontWeight: fontWeight.semibold,
    backgroundColor: tokens.markerTint,
  },
  railFiles: {
    display: "flex",
    justifyContent: "center",
    flexShrink: 0,
    width: "22px",
    marginTop: "2px",
    paddingTop: "8px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.rule,
  },
  progress: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    flexShrink: 0,
    minHeight: "52px",
    padding: "0 8px 0 16px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.rule,
    color: tokens.inkMuted,
    fontSize: fontSize.small,
  },
  progressLabel: {
    display: "flex",
    alignItems: "baseline",
    gap: "9px",
  },
  sidebarAction: {
    width: "28px",
    height: "28px",
  },
  progressActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  cabinets: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  // The courier stands on the row being written.
  lenses: {
    flex: "0 0 auto",
    minHeight: 0,
    overflow: "auto",
    position: "relative",
    paddingTop: { default: null, ":has(> .courier)": "14px" },
  },
  files: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  heading: {
    padding: "10px 14px 6px 16px",
  },
  lensesHeading: {
    paddingBottom: "2px",
  },
  filesHeading: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  nativeTree: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    position: "relative",
  },
  section: {
    borderBottomWidth: 0,
    borderBottomStyle: "none",
    borderBottomColor: "currentcolor",
  },
  // The section wears no wash; the pressed toggle already says open.
  sectionExpanded: {
    backgroundColor: tokens.transparent,
  },
  row: {
    display: "flex",
    alignItems: "center",
    paddingRight: "8px",
    gap: "7px",
  },
  toggle: {
    display: "flex",
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: "8px",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    textAlign: "left",
    padding: "3px 4px 3px 8px",
    font: "inherit",
    color: "inherit",
    cursor: "pointer",
    backgroundColor: { default: "transparent", ":hover": tokens.well },
    outline: { default: null, ":focus-visible": `1px solid ${tokens.accent}` },
    outlineOffset: { default: null, ":focus-visible": "-2px" },
  },
  // A lens with no changes (usually Uncategorized) has nothing to filter to.
  toggleEmpty: {
    color: tokens.inkFaint,
    cursor: "default",
    backgroundColor: "transparent",
  },
  toggleActive: {
    color: tokens.ink,
    fontWeight: fontWeight.semibold,
    backgroundColor: "transparent",
  },
  // The filter outranks the viewed fade; the checkbox beside it says viewed.
  faded: {
    opacity: 0.55,
  },
  toggleCounts: {
    marginLeft: "auto",
  },
  // A selected lens is a filter chip around its funnel, name and clear mark;
  // the counts stay outside it so they keep their column.
  chip: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: "8px",
    height: "24px",
    padding: "0 8px",
    borderRadius: radius.pill,
  },
  chipActive: {
    paddingRight: "4px",
    backgroundColor: tokens.markerTint,
  },
  icon: {
    flexShrink: 0,
    color: tokens.inkMuted,
  },
  name: {
    minWidth: 0,
    flex: "0 1 auto",
    lineHeight: 1.5,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  nameRelabel: {
    animationName: { default: relabel, [REDUCED]: "none" },
    animationDuration: {
      default: drawMotion.stroke,
      [REDUCED]: motion.instant,
    },
    animationTimingFunction: { default: "steps(14)", [REDUCED]: "ease" },
    animationFillMode: { default: "both", [REDUCED]: "none" },
  },
  clear: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    width: "18px",
    height: "18px",
    borderRadius: radius.pill,
    backgroundColor: {
      default: null,
      [stylex.when.ancestor(":hover", lensToggleMarker)]: tokens.markerGlow,
    },
  },
  clearMark: {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round",
  },
  // Inside the sidebar, clear of its scrollbar; line on the editor's edge.
  sidebarResizer: {
    flex: "0 0 16px",
    width: "16px",
    minWidth: "16px",
    marginLeft: "-16px",
    backgroundColor: tokens.tray,
    "::before": {
      left: "auto",
      right: 0,
      transform: "none",
    },
    // 3px past the line, short of the editor's controls.
    "::after": {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: "-3px",
      content: "''",
    },
  },
  railResizer: {
    flex: "0 0 6px",
    width: "6px",
    minWidth: "6px",
    marginLeft: "-6px",
  },
  // Overlaps the files pane; the line stays on the pane edge.
  cabinetsResizer: {
    display: "block",
    margin: "-5px 0",
    zIndex: 2,
  },
  resizing: {
    "::before": {
      backgroundColor: tokens.inkFaint,
    },
  },
  editor: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  // The workbench mounts its diff widgets here and sizes them from this box.
  host: {
    position: "relative",
    gridRow: { default: 1, [inScopedDiff()]: 2 },
    minHeight: 0,
    height: "100%",
  },
  hostInWorkspace: {
    flex: 1,
    height: "auto",
  },
  viewError: {
    display: "flex",
    alignItems: "center",
    gridRow: 1,
    alignSelf: "start",
    padding: "0 10px",
    backgroundColor: tokens.surface,
    color: tokens.inkFaint,
    font: `${fontSize.small}/1 ${tokens.fontSans}`,
  },
  error: {
    padding: "8px 12px",
    color: tokens.changeRemoved,
  },
});

const sectionMotion = stylex.create({
  queued: {
    visibility: "hidden",
  },
  landing: {
    animationName: { default: landSlot, [REDUCED]: "none" },
    animationDuration: {
      default: drawMotion.lensLand,
      [REDUCED]: motion.instant,
    },
    animationTimingFunction: { default: EASE, [REDUCED]: "ease" },
    animationFillMode: { default: "both", [REDUCED]: "none" },
  },
  attention: {
    outline: `1px solid ${tokens.accent}`,
    outlineOffset: "-1px",
    backgroundColor: tokens.markerTint,
    animationName: { default: attention, [REDUCED]: "none" },
    animationDuration: { default: drawMotion.ring, [REDUCED]: motion.instant },
    animationTimingFunction: { default: "ease-out", [REDUCED]: "ease" },
    animationFillMode: { default: "both", [REDUCED]: "none" },
  },
  erasing: {
    overflow: "clip",
    interpolateSize: "allow-keywords",
    animationName: { default: collapse, [REDUCED]: "none" },
    animationDuration: { default: drawMotion.beat, [REDUCED]: motion.instant },
    animationTimingFunction: { default: EASE, [REDUCED]: "ease" },
    animationDelay: { default: "320ms", [REDUCED]: "0s" },
    animationFillMode: { default: "both", [REDUCED]: "none" },
    display: { default: null, [REDUCED]: "none" },
  },
});

const sectionMotionStyle = (phase: MotionPhase) =>
  phase === "queued" ||
  phase === "landing" ||
  phase === "attention" ||
  phase === "erasing"
    ? sectionMotion[phase]
    : null;
