import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import {
  Courier,
  LensCursorContext,
  lensRowElement,
} from "@canvas/drawing/courier";
import { type MotionPhase, withErasedBlocks } from "@canvas/drawing/draw-queue";
import { useMotionPhases } from "@canvas/drawing/draw-queue-provider";
import { drawStyles } from "@canvas/drawing/draw-styles";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { cn } from "@canvas/lib/utils";
import { AuthoringActivityContext } from "@canvas/review/authoring-activity-context";
import { scopeLive } from "@canvas/review/authoring-cursor";
import { useReviewDiffFiles } from "@canvas/review/review-diff-files-context";
import { useReviewLenses } from "@canvas/review/review-lenses";
import {
  useBottomSheetResize,
  useRightPanelResize,
} from "@canvas/review/side-panel-resizer";
import { diffWorkspaceMarker, lensToggleMarker } from "@canvas/styles/markers";
import { shellStyles } from "@canvas/styles/shell-styles";
import { IconButton } from "@canvas/ui/button";
import { textStyles } from "@canvas/ui/text";
import type { ReviewCommitScope } from "@chalk/review-contracts";
import {
  type CoverageProgress,
  coverageProgress,
  coverageSources,
} from "@review/documents/viewed-coverage";
import type { ClassValue } from "clsx";
import { File, PanelLeftCloseIcon, PanelLeftOpenIcon, X } from "lucide-react";
import {
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
      className={cn(styles.name, phase === "relabel" && styles.nameRelabel)}
    >
      {title}
    </span>
  );
}

export function DiffCounts({
  progress,
  className,
}: {
  progress: CoverageProgress;
  className?: ClassValue;
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
      className={cn(
        diffCountStyles.counts,
        (progress.state === "viewed" || progress.state === "folded") &&
          styles.faded,
        className,
      )}
    >
      {progress.state === "viewed" ? (
        "Viewed"
      ) : progress.state === "folded" ? (
        "Folded"
      ) : (
        <>
          <span className={diffCountStyles.added}>
            +{compactDiffCount(remaining.additions)}
          </span>
          <span className={diffCountStyles.removed}>
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
      className={cn("diff-workspace", styles.workspace, diffWorkspaceMarker)}
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
        className={cn(styles.sidebar, sidebarResize.collapsed && styles.hidden)}
        style={{ width: sidebarResize.width }}
      >
        <div className={styles.progress}>
          <span className={styles.progressLabel}>
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
                    className={diffCountStyles.counts}
                    aria-label="Counting changes"
                  >
                    …
                  </span>
                )}
              </>
            )}
          </span>
          <div className={styles.progressActions}>
            <IconButton
              aria-label="Collapse diff sidebar"
              title="Collapse diff sidebar"
              className={styles.sidebarAction}
              onClick={sidebarResize.collapse}
            >
              <PanelLeftCloseIcon aria-hidden="true" />
            </IconButton>
          </div>
        </div>
        <div className={styles.cabinets} ref={cabinetsRef}>
          <div
            className={cn("diff-sidebar-lenses", styles.lenses)}
            aria-label="Lenses"
            ref={setLensList}
            style={{ flexBasis: `${(1 - cabinetsResize.fraction) * 100}%` }}
          >
            <div
              className={cn(
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
                  className={cn(
                    styles.section,
                    selected && styles.sectionExpanded,
                    phase && sectionMotionStyle(phase),
                  )}
                  data-lens-id={item.id}
                  data-motion={phase}
                >
                  <div
                    className={cn(
                      styles.row,
                      phase === "landing" && drawStyles.rowLanding,
                      phase === "erasing" && drawStyles.rowErasing,
                    )}
                  >
                    <ButtonPrimitive
                      variant="ghost"
                      size="xs"
                      className={cn(
                        "tw:h-auto tw:justify-start tw:whitespace-normal tw:font-normal",
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
                        className={cn(
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
                          <span className={styles.clear} aria-hidden="true">
                            <X
                              size={10}
                              className={styles.clearMark}
                              aria-hidden="true"
                            />
                          </span>
                        )}
                      </span>
                      {item.pending ? (
                        <span
                          className={cn(
                            diffCountStyles.counts,
                            styles.toggleCounts,
                          )}
                          aria-label="Counting changes"
                        >
                          …
                        </span>
                      ) : empty ? (
                        <span
                          className={cn(
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
                          className={styles.toggleCounts}
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
            className={cn(
              shellStyles.sheetResizer,
              styles.cabinetsResizer,
              cabinetsResize.isResizing && styles.resizing,
            )}
          />
          <div className={styles.files}>
            <div
              className={cn(
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
              className={cn("diff-native-tree", styles.nativeTree)}
              ref={setFullTree}
              style={lens ? { display: "none" } : undefined}
            />
            <div
              className={cn("diff-native-tree", styles.nativeTree)}
              ref={setLensTree}
              style={!lens ? { display: "none" } : undefined}
            />
          </div>
        </div>
      </aside>
      <div
        {...sidebarResize.separatorProps}
        className={cn(
          shellStyles.resizer,
          styles.sidebarResizer,
          sidebarResize.collapsed && styles.railResizer,
          sidebarResize.isResizing && styles.resizing,
        )}
      />
      <div className={styles.editor}>
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
          <div className={styles.error} role="alert">
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
    <nav className={styles.rail} aria-label="Lens rail">
      <div className={styles.railProgress}>
        <RailButton label="Expand diff sidebar" onClick={onExpand}>
          <PanelLeftOpenIcon size={16} aria-hidden="true" />
        </RailButton>
      </div>
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
      <div className={styles.railFiles}>
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
      className={cn(
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
      className={cn(
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
  return <File className={styles.icon} size={14} aria-hidden="true" />;
}

const styles = {
  workspace:
    "tw:flex tw:min-h-0 tw:h-full tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[1.5]",
  // The sidebar is the tray; its right padding holds the divider.
  sidebar:
    "tw:w-[320px] tw:min-w-[250px] tw:shrink-0 tw:overflow-hidden tw:flex tw:flex-col tw:pr-[16px] tw:bg-[color:var(--tray)]",
  hidden: "tw:hidden",
  rail: "tw:flex tw:flex-col tw:items-center tw:gap-[6px] tw:shrink-0 tw:w-[44px] tw:pb-[8px] tw:overflow-x-hidden tw:overflow-y-auto tw:bg-[color:var(--tray)] tw:[border-right-width:1px] tw:[border-right-style:solid] tw:[border-right-color:var(--rule)]",
  railProgress:
    "tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-[6px] tw:self-stretch tw:shrink-0 tw:min-h-[52px] tw:py-[8px] tw:mb-[2px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:text-[color:var(--ink-muted)]",
  railButton:
    "tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:size-[28px] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:rounded-[6px] tw:p-0 tw:text-[color:var(--ink-muted)] tw:cursor-pointer tw:bg-[color:transparent] tw:[&:hover]:bg-[color:var(--well)] tw:[&:focus-visible]:[outline:1px_solid_var(--accent)] tw:[&:focus-visible]:outline-offset-[-2px]",
  railLens:
    "tw:shrink-0 tw:box-border tw:w-[28px] tw:h-[24px] tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:rounded-[999px] tw:font-[family-name:inherit] tw:text-[length:inherit] tw:font-[number:inherit] tw:leading-[inherit] tw:[font-style:inherit] tw:text-[color:inherit] tw:text-center tw:whitespace-nowrap tw:cursor-pointer tw:bg-[color:transparent] tw:[&:hover]:bg-[color:var(--well)] tw:[&:focus-visible]:[outline:1px_solid_var(--accent)] tw:[&:focus-visible]:outline-offset-[-2px]",
  railLensActive:
    "tw:text-[color:var(--ink)] tw:font-semibold tw:bg-[color:var(--marker-tint)]",
  railFiles:
    "tw:flex tw:justify-center tw:shrink-0 tw:w-[22px] tw:mt-[2px] tw:pt-[8px] tw:[border-top-width:1px] tw:[border-top-style:solid] tw:[border-top-color:var(--rule)]",
  progress:
    "tw:flex tw:items-center tw:justify-between tw:gap-[8px] tw:shrink-0 tw:min-h-[52px] tw:p-[0_8px_0_16px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:text-[color:var(--ink-muted)] tw:text-[length:11px]",
  progressLabel: "tw:flex tw:items-baseline tw:gap-[9px]",
  sidebarAction: "tw:size-[28px]",
  progressActions: "tw:flex tw:items-center tw:gap-[8px]",
  cabinets: "tw:flex tw:flex-col tw:flex-[1] tw:min-h-0",
  // The courier stands on the row being written.
  lenses:
    "tw:flex-[0_0_auto] tw:min-h-0 tw:overflow-auto tw:relative tw:[&:has(>_.courier)]:pt-[14px]",
  files: "tw:flex tw:flex-col tw:flex-[1] tw:min-h-0 tw:overflow-hidden",
  heading: "tw:p-[10px_14px_6px_16px]",
  lensesHeading: "tw:pb-[2px]",
  filesHeading: "tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis",
  nativeTree: "tw:flex-[1] tw:min-h-0 tw:overflow-y-auto tw:relative",
  section:
    "tw:[border-bottom-width:0] tw:[border-bottom-style:none] tw:[border-bottom-color:currentcolor]",
  // The section wears no wash; the pressed toggle already says open.
  sectionExpanded: "tw:bg-[color:var(--transparent)]",
  row: "tw:flex tw:items-center tw:pr-[8px] tw:gap-[7px]",
  toggle:
    "tw:flex tw:flex-[1] tw:min-w-0 tw:items-center tw:gap-[8px] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:text-left tw:p-[3px_4px_3px_8px] tw:font-[family-name:inherit] tw:text-[length:inherit] tw:font-[number:inherit] tw:leading-[inherit] tw:[font-style:inherit] tw:text-[color:inherit] tw:cursor-pointer tw:bg-[color:transparent] tw:[&:focus-visible]:[outline:1px_solid_var(--accent)] tw:[&:focus-visible]:outline-offset-[-2px]",
  // A lens with no changes (usually Uncategorized) has nothing to filter to.
  toggleEmpty:
    "tw:text-[color:var(--ink-faint)] tw:cursor-default tw:bg-[color:transparent]",
  toggleActive:
    "tw:text-[color:var(--ink)] tw:font-semibold tw:bg-[color:transparent]",
  // The filter outranks the viewed fade; the checkbox beside it says viewed.
  faded: "tw:opacity-[0.55]",
  toggleCounts: "tw:ml-[auto]",
  // A selected lens is a filter chip around its funnel, name and clear mark;
  // the counts stay outside it so they keep their column.
  chip: "tw:flex tw:min-w-0 tw:items-center tw:gap-[8px] tw:h-[24px] tw:p-[0_8px] tw:rounded-[999px] tw:[&:is(.canvas-lens-toggle:hover_*)]:bg-[color:var(--well)]",
  chipActive: "tw:pr-[4px] tw:bg-[color:var(--marker-tint)]",
  icon: "tw:shrink-0 tw:text-[color:var(--ink-muted)]",
  name: "tw:min-w-0 tw:flex-[0_1_auto] tw:leading-[1.5] tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis",
  nameRelabel:
    "tw:[animation-name:-diff-view-relabel] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:420ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:steps(14)] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-fill-mode:both] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-fill-mode:none]",
  clear:
    "tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:size-[18px] tw:rounded-[999px] tw:[&:is(.canvas-lens-toggle:hover_*)]:bg-[color:var(--marker-glow)]",
  clearMark:
    "tw:fill-[none] tw:stroke-[currentColor] tw:stroke-[1.4] tw:[stroke-linecap:round]",
  // Inside the sidebar, clear of its scrollbar; line on the editor's edge.
  sidebarResizer:
    "tw:flex-[0_0_16px] tw:w-[16px] tw:min-w-[16px] tw:ml-[-16px] tw:bg-[color:var(--tray)] tw:[&::before]:left-[auto] tw:[&::before]:right-0 tw:[&::before]:[transform:none] tw:[&::after]:absolute tw:[&::after]:top-0 tw:[&::after]:bottom-0 tw:[&::after]:left-0 tw:[&::after]:right-[-3px] tw:[&::after]:[content:'']",
  railResizer: "tw:flex-[0_0_6px] tw:w-[6px] tw:min-w-[6px] tw:ml-[-6px]",
  // Overlaps the files pane; the line stays on the pane edge.
  cabinetsResizer: "tw:block tw:m-[-5px_0] tw:z-[2]",
  resizing: "tw:[&::before]:bg-[color:var(--ink-faint)]",
  editor: "tw:relative tw:flex-[1] tw:min-w-0 tw:min-h-0 tw:flex tw:flex-col",
  // The workbench mounts its diff widgets here and sizes them from this box.
  host: "tw:relative tw:[grid-row:1] tw:[&:is(.canvas-scoped-diff:is(*)_*)]:[grid-row:2] tw:min-h-0 tw:h-full",
  hostInWorkspace: "tw:flex-[1] tw:h-auto",
  viewError:
    "tw:flex tw:items-center tw:[grid-row:1] tw:[align-self:start] tw:p-[0_10px] tw:bg-[color:var(--surface)] tw:text-[color:var(--ink-faint)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[1]",
  error: "tw:p-[8px_12px] tw:text-[color:var(--change-removed)]",
};

const sectionMotion = {
  queued: "tw:invisible",
  landing:
    "tw:[animation-name:-diff-view-land-slot] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:520ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:cubic-bezier(0.2,_0.7,_0.2,_1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-fill-mode:both] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-fill-mode:none]",
  attention:
    "tw:[outline:1px_solid_var(--accent)] tw:outline-offset-[-1px] tw:bg-[color:var(--marker-tint)] tw:[animation-name:-diff-view-attention] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:250ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:ease-out] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-fill-mode:both] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-fill-mode:none]",
  erasing:
    "tw:overflow-clip tw:[interpolate-size:allow-keywords] tw:[animation-name:-diff-view-collapse] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:200ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:cubic-bezier(0.2,_0.7,_0.2,_1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-delay:320ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-delay:0s] tw:[animation-fill-mode:both] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-fill-mode:none] tw:[@media_(prefers-reduced-motion:_reduce)]:hidden",
};

const sectionMotionStyle = (phase: MotionPhase) =>
  phase === "queued" ||
  phase === "landing" ||
  phase === "attention" ||
  phase === "erasing"
    ? sectionMotion[phase]
    : null;
