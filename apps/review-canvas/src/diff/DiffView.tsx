import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canvas/components/ui/popover";
import { Courier, lensRowElement } from "@canvas/drawing/courier";
import { type MotionPhase, withErasedBlocks } from "@canvas/drawing/draw-queue";
import { useMotionPhases } from "@canvas/drawing/draw-queue-provider";
import { drawStyles } from "@canvas/drawing/draw-styles";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { cn } from "@canvas/lib/utils";
import { useReviewDiffFiles } from "@canvas/review/review-diff-files-context";
import { useReviewLenses } from "@canvas/review/review-lenses";
import { diffWorkspaceMarker, lensToggleMarker } from "@canvas/styles/markers";
import { Button } from "@canvas/ui/button";
import { textStyles } from "@canvas/ui/text";
import type { ReviewCommitScope } from "@chalk/review-contracts";
import {
  type CoverageProgress,
  coverageProgress,
  coverageSources,
} from "@review/documents/viewed-coverage";
import type { ClassValue } from "clsx";
import {
  ChevronDownIcon,
  FolderTreeIcon,
  ListFilterIcon,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

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

/** Where the shown diff puts its navigation buttons, in the canvas toolbar. */
export const DiffNavigationSlot = createContext<HTMLElement | null>(null);

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
  const [navigationOpen, setNavigationOpen] = useState<
    "lenses" | "files" | null
  >(null);

  const lenses = useReviewLenses();
  const diffFiles = useReviewDiffFiles();
  const lens = scope ? undefined : lenses?.active;
  const [lensList, setLensList] = useState<HTMLDivElement | null>(null);
  const rows = useLensRows(lenses?.lenses ?? []);
  const toolbarSlot = useContext(DiffNavigationSlot);

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
  const openNavigation = (section: "lenses" | "files") => (open: boolean) =>
    setNavigationOpen(open ? section : null);
  // Switching popovers: returning focus to the old trigger would close the new one.
  const keepFocus = (event: Event) => navigationOpen && event.preventDefault();

  // diff-workspace is a marker global.css keys on.
  return (
    <div
      className={cn("diff-workspace", styles.workspace, diffWorkspaceMarker)}
    >
      <Popover
        open={navigationOpen === "lenses" && !!toolbarSlot}
        onOpenChange={openNavigation("lenses")}
      >
        {toolbarSlot &&
          createPortal(
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="tw:max-w-[240px]"
                aria-label="Lenses"
                data-diff-navigation="lenses"
              >
                <ListFilterIcon aria-hidden="true" />
                <span className="tw:truncate">{lens?.title ?? "No lens"}</span>
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            </PopoverTrigger>,
            toolbarSlot,
          )}
        <PopoverContent
          align="start"
          aria-label="Lenses"
          className={styles.popover}
          onCloseAutoFocus={keepFocus}
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
          </div>

          <div
            className={cn("diff-lenses", styles.lenses)}
            aria-label="Lenses"
            ref={setLensList}
          >
            <ButtonPrimitive
              variant="ghost"
              size="xs"
              className={cn(
                styles.noLens,
                !lens && "tw:bg-muted tw:text-foreground",
              )}
              aria-pressed={!lens}
              onClick={lenses.clear}
            >
              No lens
              <span className="tw:ml-auto tw:text-muted-foreground tw:font-normal">
                All changes
              </span>
            </ButtonPrimitive>
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
        </PopoverContent>
      </Popover>
      <Popover
        open={navigationOpen === "files" && !!toolbarSlot}
        onOpenChange={openNavigation("files")}
      >
        {toolbarSlot &&
          createPortal(
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                aria-label="Files"
                data-diff-navigation="files"
              >
                <FolderTreeIcon aria-hidden="true" />
                Files
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            </PopoverTrigger>,
            toolbarSlot,
          )}
        <PopoverContent
          align="start"
          aria-label="Files"
          className={styles.popover}
          onCloseAutoFocus={keepFocus}
        >
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
        </PopoverContent>
      </Popover>
      <div className={styles.editor}>
        <PierreDiffView
          treeContainer={fullTree ?? undefined}
          progress={fullProgress}
          onToggleViewed={(path) => markFile(path, false)}
          hidden={!!lens}
          inWorkspace
        />
        {lens && (
          <PierreDiffView
            lens={lens}
            treeContainer={lensTree ?? undefined}
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

const styles = {
  workspace:
    "tw:flex tw:min-h-0 tw:h-full tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[1.5]",
  popover:
    "tw:w-[380px] tw:max-w-[calc(100vw-24px)] tw:max-h-[min(520px,var(--radix-popover-content-available-height))] tw:flex tw:flex-col tw:p-2 tw:text-[length:12px]",
  progress: "tw:shrink-0 tw:px-2 tw:py-2 tw:text-muted-foreground tw:text-xs",
  progressLabel: "tw:flex tw:items-baseline tw:gap-2",
  noLens: "tw:mb-1 tw:w-full tw:justify-start tw:px-3 tw:h-8",
  // The courier stands on the row being written.
  lenses:
    "tw:min-h-0 tw:overflow-auto tw:relative tw:[&:has(>_.courier)]:pt-[14px]",
  files: "tw:flex tw:flex-col tw:h-[320px] tw:min-h-0 tw:overflow-hidden",
  heading: "tw:p-[10px_14px_6px_16px]",
  filesHeading: "tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis",
  nativeTree: "tw:flex-[1] tw:min-h-0 tw:overflow-y-auto tw:relative",
  section:
    "tw:[border-bottom-width:0] tw:[border-bottom-style:none] tw:[border-bottom-color:currentcolor]",
  // The section wears no wash; the pressed toggle already says open.
  sectionExpanded: "tw:bg-[color:var(--transparent)]",
  row: "tw:flex tw:items-center tw:pr-[8px] tw:gap-[7px]",
  toggle:
    "tw:flex tw:flex-[1] tw:min-w-0 tw:items-center tw:gap-[8px] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:text-left tw:p-[3px_4px_3px_8px] tw:font-[family-name:inherit] tw:text-[length:inherit] tw:font-[number:inherit] tw:leading-[inherit] tw:[font-style:inherit] tw:text-[color:inherit] tw:cursor-pointer tw:bg-[color:transparent] tw:hover:bg-transparent tw:dark:hover:bg-transparent tw:[&:focus-visible]:[outline:1px_solid_var(--accent)] tw:[&:focus-visible]:outline-offset-[-2px]",
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
  name: "tw:min-w-0 tw:flex-[0_1_auto] tw:leading-[1.5] tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis",
  nameRelabel:
    "tw:[animation-name:-diff-view-relabel] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:420ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:steps(14)] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-fill-mode:both] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-fill-mode:none]",
  clear:
    "tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:size-[18px] tw:rounded-[999px] tw:[&:is(.canvas-lens-toggle:hover_*)]:bg-[color:var(--marker-glow)]",
  clearMark:
    "tw:fill-[none] tw:stroke-[currentColor] tw:stroke-[1.4] tw:[stroke-linecap:round]",
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
