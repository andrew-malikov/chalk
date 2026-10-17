import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { drawStyles } from "@canvas/drawing/draw-styles";
import { cn } from "@canvas/lib/utils";
import {
  useReviewPanel,
  useReviewPanelActor,
} from "@canvas/review/review-panel";
import type {
  GuidedTour,
  GuidedTourStop,
} from "@canvas/review/review-panel-model";
import type { FlowDiagramBlock } from "@review/blocks/flow_diagram";
import type { Snapshot } from "@review/node/review-api/store";
import { useCallback, useMemo } from "react";
import { createPortal } from "react-dom";

import { DiagramHeader } from "./diagram-header";
import { diagramStyles } from "./diagram-styles";
import { DiagramTourOverlay, useDiagramTourShell } from "./diagram-tour";
import { FlowGraph } from "./flow-graph";

/** Each attachment is a tour stop; selection still belongs to its graph node. */
export function flowTourStops(
  block: FlowDiagramBlock,
): (GuidedTourStop & { nodeKey: string })[] {
  return block.nodes.flatMap<GuidedTourStop & { nodeKey: string }>((node) => {
    const sources = node.attachments.flatMap((attachment) =>
      attachment.sources.map((source) => ({ label: attachment.label, source })),
    );

    return sources.length
      ? sources.map(({ label, source }, index) => ({
          nodeKey: node.key,
          anchor: {
            id: `${block.id}:${node.key}:${index}`,
            title: node.label,
            peek: source,
          },
          label: node.label,
          detail: label,
          content: { kind: "source" as const, source: source },
        }))
      : [
          {
            nodeKey: node.key,
            anchor: { id: `${block.id}:${node.key}`, title: node.label },
            label: node.label,
            content: {
              kind: "explanation" as const,
              text: node.description ?? "This node has no code attachments.",
            },
          },
        ];
  });
}

export function FlowDiagram({
  node,
}: {
  node: FlowDiagramBlock & { id: string };
  snapshot: Snapshot;
}) {
  const stops = useMemo(() => flowTourStops(node), [node]);

  const tour = useMemo<GuidedTour>(
    () => ({ id: node.id, title: node.title, stops }),
    [node.id, node.title, stops],
  );

  const panelActor = useReviewPanelActor();

  const selection = useReviewPanel((state) =>
    state.context.overlayTour?.tourId === tour.id &&
    stops.some((stop) => stop.anchor.id === state.context.overlayTour!.anchor)
      ? state.context.overlayTour
      : null,
  );

  const close = useCallback(
    () => panelActor.send({ type: "closeOverlayTour" }),
    [panelActor],
  );

  const moveOverlayTour = (anchor: string, { reveal }: { reveal: boolean }) =>
    panelActor.send({ type: "moveOverlayTour", anchor, reveal });

  const { portalTarget } = useDiagramTourShell(selection !== null, close);

  const selectedKey = stops.find(
    (stop) => stop.anchor.id === selection?.anchor,
  )?.nodeKey;

  const open = (nodeKey?: string) => {
    const anchor = (
      nodeKey ? stops.find((stop) => stop.nodeKey === nodeKey) : stops[0]
    )?.anchor.id;

    if (anchor)
      panelActor.send({
        type: "openOverlayTour",
        tour: { tourId: tour.id, kind: "flow" },
        anchor,
      });
  };

  const figure = (fullscreen: boolean) => (
    // The class is how document-embed-scroll.ts recognizes the embed.
    <figure
      className={cn(
        "flow-diagram",
        styles.figure,
        fullscreen && styles.stage,
        drawStyles.blockChild,
      )}
      aria-label={node.title}
    >
      <DiagramHeader
        kind="FLOW"
        title={node.title}
        meta={`${node.nodes.length} ${node.nodes.length === 1 ? "node" : "nodes"}`}
        action={
          <ButtonPrimitive
            variant="ghost"
            size="xs"
            className={cn("diagram-tour-button", diagramStyles.control)}
            onClick={() => (fullscreen ? close() : open())}
            aria-label={
              fullscreen ? "Close expanded diagram" : "Expand diagram"
            }
          >
            {fullscreen ? "Close" : "Expand"}
          </ButtonPrimitive>
        }
      />
      {node.description && (
        <p className={styles.description}>{node.description}</p>
      )}
      <div className={cn(styles.body, fullscreen && styles.stageBody)}>
        <div className={styles.canvas}>
          <FlowGraph
            block={node}
            selectedKey={fullscreen ? selectedKey : undefined}
            onSelect={(item) => open(item.key)}
            interactive={fullscreen}
            // Inline, a top-to-bottom flow stacks its layers and wants the
            // room; a left-to-right one reads fine shorter.
            height={
              fullscreen ? "100%" : node.direction === "right" ? 420 : 560
            }
          />
        </div>
      </div>
      <footer className={styles.footer}>
        <span>
          Select a node to explore its code
          {!fullscreen && " · pinch or ⌘/Ctrl + scroll to zoom"}
        </span>
        <span className={styles.legend}>
          <i className={cn(styles.swatch, styles.added)} />
          Added
          <i className={cn(styles.swatch, styles.removed)} />
          Removed
          <i className={cn(styles.swatch, styles.modified)} />
          Modified
        </span>
      </footer>
    </figure>
  );

  return (
    <>
      {figure(false)}
      {selection && portalTarget
        ? createPortal(
            <DiagramTourOverlay
              flow
              tour={tour}
              activeAnchor={selection.anchor}
              revealRequest={selection.revealRequest}
              onClose={close}
              onActiveAnchorChange={moveOverlayTour}
            >
              {figure(true)}
            </DiagramTourOverlay>,
            portalTarget,
          )
        : null}
    </>
  );
}

const styles = {
  figure:
    "tw:overflow-hidden tw:m-[18px_0_4px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[8px] tw:bg-[color:var(--surface)] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:12px] tw:font-normal tw:leading-[1.5]",
  // The tour stage: the figure fills the overlay without its card chrome.
  stage:
    "tw:flex tw:flex-col tw:w-full tw:h-full tw:min-h-0 tw:m-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:rounded-none",
  // Keeps its caption type among document paragraphs.
  description:
    "tw:m-0 tw:p-[0_16px_12px] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[1.6] tw:[&:is(.canvas-document:is(*)_*)]:text-left",
  body: "tw:flex tw:[border-top-width:0] tw:[border-top-style:none]",
  stageBody: "tw:flex-[1] tw:min-h-0 tw:max-h-none",
  canvas:
    "tw:relative tw:flex-[1] tw:min-w-0 tw:bg-[color:var(--surface)] tw:[background-image:var(--board-grid)] tw:[background-repeat:repeat]",
  footer:
    "tw:flex tw:flex-wrap tw:justify-between tw:gap-[12px] tw:p-[9px_16px] tw:[border-top-width:1px] tw:[border-top-style:solid] tw:[border-top-color:var(--rule)] tw:bg-[color:var(--tray)] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:text-[length:10px] tw:font-normal tw:leading-[1.5] tw:text-[length:11px]",
  legend: "tw:flex tw:items-center tw:gap-[6px]",
  swatch: "tw:inline-block tw:size-[6px] tw:ml-[7px] tw:rounded-[50%]",
  added: "tw:bg-[color:var(--change-added)]",
  removed: "tw:bg-[color:var(--change-removed)]",
  modified: "tw:bg-[color:var(--change-modified)]",
};
