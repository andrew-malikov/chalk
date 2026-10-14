import { AuthoringCursorContext, Courier } from "@canvas/drawing/courier";
import { withErasedBlocks } from "@canvas/drawing/draw-queue";
import {
  useMotionPhase,
  useMotionPhases,
} from "@canvas/drawing/draw-queue-provider";
import { drawStyles } from "@canvas/drawing/draw-styles";
import { useReviewSession } from "@canvas/host/review-session";
import { AuthoringActivityContext } from "@canvas/review/authoring-activity-context";
import { scopeLive } from "@canvas/review/authoring-cursor";
import { useReviewRoots } from "@canvas/review/review-root-context";
import type { SoftwareMapResolvedDataPayload } from "@canvas/software-map/software-map-snapshot";
import { documentNodeMarker, proseMarker } from "@canvas/styles/markers.stylex";
import type { ReviewCommitSummary } from "@chalk/review-contracts";
import type { ReviewApiClient } from "@chalk/review-contracts";
import type { PeekableAnchorRef as DocumentPeekableAnchor } from "@review/documents/authoring";
import {
  type Block,
  elements,
  resourceReferences,
  selectionReferences,
} from "@review/documents/document";
import { type DiffSelection } from "@review/documents/lens-selection";
import type { LocalReviewData } from "@review/node/review-api/local-data";
import type { Snapshot } from "@review/node/review-api/store";
import type { NormalizedSoftwareModel } from "@review/software-map/software-map-model";
import * as stylex from "@stylexjs/stylex";
import { memo, useContext, useEffect, useMemo, useRef, useState } from "react";

import { markdownHasTitle } from "./agent-markdown";
import { type ApiHeadingIds, apiHeadingIds } from "./api-document-headings";
import {
  BlockErrorBoundary,
  type StoredBlock,
  renderBlock,
  stored,
} from "./blocks";
import { documentStyles } from "./document-styles";
import { reportReviewDocumentRenderError } from "./review-document-error-report";
import { ReviewDocumentTitle } from "./review-document-surface";
import { cssIdentifier, scrollToReviewHeading } from "./review-heading-scroll";

export interface ApiDocumentData {
  snapshot: Snapshot;
  headings: ApiHeadingIds;
  commits: ReviewCommitSummary[];
  anchors: Map<string, DocumentPeekableAnchor>;
  images: Map<string, string>;

  maps: Map<
    string,
    NormalizedSoftwareModel & {
      pinnedData: SoftwareMapResolvedDataPayload & {
        side: "base" | "head";
        diagramId?: string;
      };
    }
  >;
}

/** Cache only immutable resources and commit-addressed quotes, for this canvas. */
export function createDocumentLoader(client: ReviewApiClient) {
  const cache = new Map<string, Promise<unknown>>();
  const urls = new Set<string>();
  let disposed = false;

  const once = <T,>(key: string, read: () => Promise<T>): Promise<T> => {
    if (!cache.has(key))
      cache.set(
        key,
        read().catch((error) => {
          cache.delete(key);
          throw error;
        }),
      );

    // SAFETY: each key identifies one immutable resource and its loader's result type.
    return cache.get(key) as Promise<T>;
  };

  return {
    dispose() {
      disposed = true;

      for (const url of urls) URL.revokeObjectURL(url);
      cache.clear();
    },
    async load(snapshot: Snapshot): Promise<ApiDocumentData> {
      const data: ApiDocumentData = {
        snapshot,
        headings: apiHeadingIds(snapshot.document),
        commits:
          snapshot.sourceUnavailable || !snapshot.pins
            ? []
            : await once(`commits:${JSON.stringify(snapshot.pins)}`, () =>
                client.read<ReviewCommitSummary[]>(
                  `/${snapshot.reviewId}/commits?version=${snapshot.version}`,
                ),
              ),
        anchors: new Map(),
        images: new Map(),

        maps: new Map(),
      };

      for (const { id, source, label } of selectionReferences(
        snapshot.document,
        { tolerant: true },
      )) {
        if (snapshot.staleSources?.includes(id)) continue;
        data.anchors.set(
          id,
          sourceAnchor(
            id,
            source,
            label ?? `${source.file}:${source.start.line}`,
          ),
        );
      }

      await Promise.all(
        resourceReferences(snapshot.document).map(async (node) => {
          if (node.type === "image") {
            const url = await once(`image:${node.assetId}`, async () => {
              const blob = await (
                await client.response(
                  `/${encodeURIComponent(snapshot.reviewId)}/resources/${encodeURIComponent(node.assetId)}`,
                )
              ).blob();

              if (disposed) throw new Error("Canvas closed.");
              const url = URL.createObjectURL(blob);
              urls.add(url);

              return url;
            });

            data.images.set(node.assetId, url);
          }

          if (node.type === "software_map") {
            const model = await once(
              `map:${node.mapVersionId}:${JSON.stringify(snapshot.pins ?? null)}`,
              async () => {
                const saved = await client.read<
                  Awaited<ReturnType<LocalReviewData["map"]>>
                >(
                  `/${snapshot.reviewId}/maps/${encodeURIComponent(node.mapVersionId)}?version=${snapshot.version}`,
                );

                return {
                  ...saved,
                  pinnedData: {
                    side: saved.side,
                    counts: new Map(Object.entries(saved.countsByElementPath)),
                    unmappedByElementPath: new Map(
                      Object.entries(saved.unmappedByElementPath),
                    ),
                  },
                  elementsByPath: new Map(
                    saved.elements.map((element) => [element.path, element]),
                  ),
                };
              },
            );

            if (!data.maps.has(node.mapVersionId))
              data.maps.set(node.mapVersionId, {
                ...model,
                pinnedData: { ...model.pinnedData, diagramId: node.id },
              });
          }
        }),
      );

      return data;
    },
  };
}

export function sourceAnchor(
  id: string,
  source: DiffSelection,
  title: string,
): DocumentPeekableAnchor {
  return { __kind: "db-anchor-ref", id, title, peek: source };
}

export const documentHasTitle = (document: Snapshot["document"]) =>
  elements(document).some(
    (node) => node.type === "markdown" && markdownHasTitle(node.markdown),
  );

export function ApiDocument({
  data,
  softwareMapEnabled = true,
}: {
  data: ApiDocumentData;
  softwareMapEnabled?: boolean;
}) {
  useHeadingFragments();

  const hasTitle = useMemo(
    () => documentHasTitle(data.snapshot.document),
    [data.snapshot.document],
  );

  // The scratchpad is a napkin, not a titled document: no heading, no
  // updated-ago line, just the blocks.
  const scratchpad = data.snapshot.kind === "scratchpad";
  const region = useEditingRegion(data.snapshot.document);

  return (
    <>
      {!hasTitle && !scratchpad && (
        <ReviewDocumentTitle>{data.snapshot.title}</ReviewDocumentTitle>
      )}
      <DocumentBlocks
        nodes={data.snapshot.document}
        data={data}
        softwareMapEnabled={softwareMapEnabled}
        region={region}
      />
      <Courier />
    </>
  );
}

/** How long after the courier's last move the agent still counts as
 * writing; the courier sits down at the same moment. */
const WRITING_MS = 3000;

/** The top-level block the agent is editing, the one holding the courier,
 * while the document lease is live: writing while the courier keeps moving,
 * idle once he sits. */
function useEditingRegion(
  document: Block[],
): { id: string; writing: boolean } | null {
  const cursor = useContext(AuthoringCursorContext);
  const live = scopeLive(useContext(AuthoringActivityContext), "document");
  const [quietSeq, setQuietSeq] = useState<number>();
  const seq = cursor?.seq;

  useEffect(() => {
    if (seq === undefined) return;
    const timer = setTimeout(() => setQuietSeq(seq), WRITING_MS);

    return () => clearTimeout(timer);
  }, [seq]);

  const id = useMemo(() => {
    if (!cursor) return undefined;

    return document.find((top) =>
      elements([top]).some(
        (node) => node.id === cursor.blockId || node.id === cursor.targetId,
      ),
    )?.id;
  }, [document, cursor]);

  if (!live || !cursor || id === undefined) return null;

  return { id, writing: quietSeq !== cursor.seq };
}

/** Follows a `#fragment` link to one of the document's headings, which can sit
 * in a collapsed section the browser cannot reach; other fragments are left to it. */
function useHeadingFragments(): void {
  const roots = useReviewRoots();

  useEffect(() => {
    const article = roots?.articleRef.current;

    if (!roots || !article) return;

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey)
        return;

      const target = event.target;

      const link =
        target instanceof Element
          ? target.closest<HTMLAnchorElement>('a[href^="#"]')
          : null;

      const id = link?.getAttribute("href")?.slice(1);

      if (!id || !article.querySelector(`#${cssIdentifier(id)}`)) return;
      event.preventDefault();
      scrollToReviewHeading(id, article, roots.scrollRegionRef.current);
    };

    article.addEventListener("click", onClick);

    return () => article.removeEventListener("click", onClick);
  }, [roots]);
}

/**
 * One list of sibling blocks. A block the latest version removed is kept on
 * the board, in its old place, for as long as the draw queue is erasing it;
 * the list remembers the version before so it still has the block to show.
 */
function DocumentBlocks({
  nodes,
  data,
  softwareMapEnabled,
  region,
}: {
  nodes: Block[];
  data: ApiDocumentData;
  softwareMapEnabled: boolean;
  /** Only the top level has a region: the block the agent is editing. */
  region?: { id: string; writing: boolean } | null;
}) {
  const phases = useMotionPhases();
  const previous = useRef(nodes);
  const shown = withErasedBlocks(nodes, previous.current, phases);

  useEffect(() => {
    previous.current = shown;
  });

  return shown.map((node) => (
    <DocumentNode
      key={node.id}
      node={node}
      data={data}
      softwareMapEnabled={softwareMapEnabled}
      region={
        region === undefined
          ? undefined
          : !region || region.id !== node.id
            ? "off"
            : region.writing
              ? "writing"
              : "idle"
      }
    />
  ));
}

// Memoized: unrelated App renders must not rebuild every block's view models.
export const DocumentNode = memo(function DocumentNode({
  node,
  data,
  softwareMapEnabled,
  region,
}: {
  node: Block;
  data: ApiDocumentData;
  softwareMapEnabled: boolean;
  region?: "writing" | "idle" | "off";
}) {
  const session = useReviewSession();
  const motion = useMotionPhase(node.id);

  const children = (nodes: Block[]) => (
    <DocumentBlocks
      nodes={nodes}
      data={data}
      softwareMapEnabled={softwareMapEnabled}
    />
  );

  if (
    node.type === "software_map" &&
    (!softwareMapEnabled || data.snapshot.origin?.tutorial)
  )
    return null;

  const block = stored(node);

  const stale =
    block.type !== "section" &&
    selectionReferences([block], { tolerant: true }).some((reference) =>
      data.snapshot.staleSources?.includes(reference.id),
    );

  const prose = node.type === "markdown";

  // Document and drawing styles find a block's own elements by its
  // data-review-node-id, and its prose by proseMarker.
  return (
    <div
      {...stylex.props(
        documentNodeMarker,
        prose && proseMarker,
        drawStyles.blockChild,
        motion === "queued" && drawStyles.queued,
        motion === "landing" && drawStyles.landing,
        motion === "rewriting" && drawStyles.rewriting,
        motion === "erasing" && drawStyles.erasing,
        region && drawStyles.region,
        (region === "writing" || region === "idle") && drawStyles.regionOn,
        region === "writing"
          ? drawStyles.blockPulse
          : motion === "erasing"
            ? drawStyles.blockCollapse
            : motion === "landing" && drawStyles.blockLand,
      )}
      data-review-node-id={node.id}
      data-motion={motion}
      data-region={region}
      data-review-copy-prose={prose || undefined}
    >
      <BlockErrorBoundary
        block={block}
        onError={(error) => reportReviewDocumentRenderError(session, error)}
      >
        {stale ? (
          <p
            role="status"
            {...stylex.props(
              documentStyles.note,
              documentStyles.column,
              drawStyles.blockChild,
            )}
          >
            This source range changed. Update the reference to view it.
          </p>
        ) : (
          renderBlock(block.type, block, data, children)
        )}
      </BlockErrorBoundary>
    </div>
  );
});
