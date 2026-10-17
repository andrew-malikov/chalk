import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { DiagramHeader } from "@canvas/diagrams/diagram-header";
import {
  compactDiffCount as compact,
  diffCountStyles,
} from "@canvas/diff/diff-count";
import { drawStyles } from "@canvas/drawing/draw-styles";
import { cn } from "@canvas/lib/utils";
import { useReviewLenses } from "@canvas/review/review-lenses";
import { useReviewPanelActor } from "@canvas/review/review-panel";
import { callEdgeMarker } from "@canvas/styles/markers";
import { CheckIcon } from "@canvas/ui/icons";
import type { CallStackDiffBlock } from "@review/blocks/call_stack_diff";
import type { DiffSelection } from "@review/documents/lens-selection";
import { useState } from "react";

import { type CallTreeStop, callTreeStops } from "./call-tree";

// Presentation retained from review-experimental's DiffWorkspace.
export function CallTree({
  block,
  onReveal,
  requireReady = false,
  currentStopId = null,
}: {
  block: CallStackDiffBlock;
  requireReady?: boolean;
  onReveal(source: DiffSelection, sectionId?: string, anchorId?: string): void;
  /** Set by a scroll-tracking host; otherwise the last clicked stop is current. */
  currentStopId?: string | null;
}) {
  const lenses = useReviewLenses();
  const stops = callTreeStops(block);
  const [clicked, setClicked] = useState<string>();
  const active = currentStopId ?? clicked;

  return (
    <nav aria-label="Call tree">
      <div className={styles.tree}>
        {stops.map((stop, index) => {
          const availability = requireReady
            ? lenses?.availability(stop.sources)
            : "ready";

          const unavailable = availability !== "ready";
          const stats = lenses?.stats(lenses.resolve(stop.sources));

          const change =
            stats?.total.additions && stats?.total.deletions
              ? "modified"
              : stats?.total.additions
                ? "added"
                : stats?.total.deletions
                  ? "removed"
                  : "unchanged";

          return (
            <div className={styles.entry} key={stop.id}>
              <TreeConnectors
                stop={stop}
                parentDistance={
                  index -
                  stops.findIndex((candidate) => candidate.id === stop.parentId)
                }
                onCallSite={() => {
                  if (
                    stop.callSite &&
                    (!requireReady ||
                      lenses?.availability([stop.callSite]) === "ready")
                  )
                    onReveal(stop.callSite, stop.id, stop.anchorId);
                }}
              />
              <ButtonPrimitive
                variant="ghost"
                size="xs"
                type="button"
                disabled={unavailable}
                style={{
                  paddingLeft: 14 + (stop.depth + 1) * 16,
                  opacity: unavailable ? 0.45 : undefined,
                }}
                className={cn(
                  "tw:h-auto tw:whitespace-normal tw:font-normal",
                  styles.row,
                  stop.id === active && styles.rowCurrent,
                )}
                data-review-anchor-id={stop.anchorId}
                aria-current={stop.id === active ? "true" : undefined}
                aria-label={`${stop.label}, ${change}`}
                title={
                  unavailable
                    ? availability === "pending"
                      ? "Waiting for diff…"
                      : "Source unavailable at these pins"
                    : [stop.label, stop.via].filter(Boolean).join(" · ")
                }
                onClick={() => {
                  setClicked(stop.id);
                  onReveal(stop.source, stop.id, stop.anchorId);
                }}
              >
                <span
                  className={cn(
                    styles.name,
                    change !== "unchanged" && styles[change],
                  )}
                >
                  {stop.label}
                </span>
                {unavailable && (
                  <span className={styles.stats}>
                    {availability === "pending" ? "…" : "Unavailable"}
                  </span>
                )}
                {!unavailable && stats && change !== "unchanged" && (
                  <span
                    className={styles.stats}
                    title={`Remaining +${stats.remaining.additions} −${stats.remaining.deletions} · Total +${stats.total.additions} −${stats.total.deletions}`}
                  >
                    {stats.state === "viewed" ? (
                      <span aria-label="Viewed">
                        <CheckIcon />
                      </span>
                    ) : stats.state === "folded" ? (
                      "Folded"
                    ) : (
                      <>
                        <span className={diffCountStyles.added}>
                          +{compact(stats.remaining.additions)}
                        </span>
                        <span className={diffCountStyles.removed}>
                          −{compact(stats.remaining.deletions)}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </ButtonPrimitive>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function TreeConnectors({
  stop,
  parentDistance,
  onCallSite,
}: {
  stop: CallTreeStop;
  parentDistance: number;
  onCallSite: () => void;
}) {
  // The section title is the visual parent of every top-level call.
  const width = (stop.depth + 1) * 16;
  const branchX = stop.depth === 0 ? 0.5 : width - 10;

  return (
    <svg
      className={styles.connectors}
      width={width}
      height="26"
      viewBox={`0 0 ${width} 26`}
    >
      {stop.branches.map((continues, index) =>
        continues ? (
          <path
            key={index}
            className={styles.path}
            d={`M ${index === 0 ? 0.5 : index * 16 + 6} 0 V 26`}
          />
        ) : null,
      )}
      {!stop.last ? (
        <path className={styles.path} d={`M ${branchX} 13 V 26`} />
      ) : null}
      <g
        role={stop.callSite ? "button" : undefined}
        tabIndex={stop.callSite ? 0 : undefined}
        aria-label={
          stop.callSite ? `Go to call site of ${stop.label}` : undefined
        }
        {...(stop.callSite
          ? { className: cn(callEdgeMarker, styles.edge) }
          : undefined)}
        onClick={stop.callSite ? onCallSite : undefined}
        onKeyDown={
          stop.callSite
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onCallSite();
                }
              }
            : undefined
        }
      >
        <title>
          {stop.callSite
            ? `Go to call site of ${stop.label}`
            : "No call-site location recorded"}
        </title>
        <path className={styles.path} d={`M ${branchX} 0 V 13 H ${width}`} />
        {stop.callSite ? (
          <>
            <path
              className={cn(styles.path, styles.edgeHighlight)}
              d={`M ${branchX} ${-(parentDistance - 1) * 26} V 13 H ${width}`}
            />
            <path
              className={cn(styles.path, styles.edgeHit)}
              d={`M ${branchX} 0 V 13 H ${width}`}
            />
          </>
        ) : null}
      </g>
    </svg>
  );
}

/** Document host: the same tree, with source peeks instead of diff navigation. */
export function DocumentCallTree({ block }: { block: CallStackDiffBlock }) {
  const panelActor = useReviewPanelActor();

  return (
    <figure
      className={cn(styles.figure, drawStyles.blockChild)}
      data-review-call-stack="ready"
    >
      <DiagramHeader kind="Call tree" title={block.title ?? "Call tree"} />
      <CallTree
        block={block}
        onReveal={(source, sectionId, anchorId) => {
          const stop = callTreeStops(block).find(
            (stop) => stop.id === sectionId,
          )!;

          panelActor.send({
            type: "openPeek",
            panel: {
              kind: "peek",
              anchor: {
                id: anchorId ?? sectionId!,
                title: stop.label,
                peek: source,
              },
              content: { kind: "source", source },
            },
          });
        }}
      />
    </figure>
  );
}

const styles = {
  figure:
    "tw:m-[14px_0] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[8px] tw:overflow-hidden tw:bg-[color:var(--surface)]",
  tree: "tw:min-w-full tw:w-full tw:p-[6px_0_12px]",
  // A hovered or focused call-site edge paints over the rows below it.
  entry:
    "tw:relative tw:[&:has(.canvas-call-edge:hover)]:z-[1] tw:[&:has(.canvas-call-edge:focus-visible)]:z-[1]",
  row: "tw:relative tw:flex tw:items-center tw:w-full tw:h-[26px] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:p-[0_12px_0_14px] tw:bg-[color:transparent] tw:[&:hover:not(:disabled)]:bg-[color:color-mix(in_srgb,_var(--ink)_3%,_transparent)] tw:font-[family-name:var(--font-mono)] tw:text-[length:12px] tw:font-normal tw:leading-[26px] tw:text-left tw:whitespace-nowrap",
  rowCurrent: "tw:bg-[color:var(--marker-tint)] tw:font-semibold",
  name: "tw:flex-[0_1_auto] tw:min-w-[32px] tw:overflow-hidden tw:text-ellipsis",
  added: "tw:text-[color:var(--change-added)]",
  removed:
    "tw:text-[color:var(--change-removed)] tw:[text-decoration-line:line-through] tw:[text-decoration-color:color-mix(in_srgb,_var(--change-removed)_50%,_transparent)]",
  modified: "tw:text-[color:var(--change-modified)]",
  stats:
    "tw:inline-flex tw:gap-[5px] tw:tabular-nums tw:shrink-0 tw:ml-[auto] tw:pl-[12px] tw:text-[length:10px]",
  connectors:
    "tw:shrink-0 tw:self-stretch tw:absolute tw:left-[14px] tw:top-0 tw:z-[1] tw:pointer-events-none tw:overflow-visible",
  path: "tw:stroke-[var(--rule-soft)] tw:fill-[none] tw:stroke-[1]",
  edge: "tw:pointer-events-auto tw:cursor-pointer",
  edgeHit: "tw:stroke-[transparent] tw:stroke-[10px]",
  edgeHighlight:
    "tw:invisible tw:[&:is(.canvas-call-edge:hover_*)]:visible tw:[&:is(.canvas-call-edge:focus-visible_*)]:visible tw:pointer-events-none tw:stroke-[var(--rule-soft)] tw:[&:is(.canvas-call-edge:hover_*)]:stroke-[var(--ink)] tw:[&:is(.canvas-call-edge:focus-visible_*)]:stroke-[var(--ink)] tw:stroke-[1] tw:[&:is(.canvas-call-edge:hover_*)]:stroke-[2px] tw:[&:is(.canvas-call-edge:focus-visible_*)]:stroke-[2px]",
};
