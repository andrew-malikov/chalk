import { useAgentSelection } from "@canvas/agent-context/agent-selection";
import { observeAgentTextSelection } from "@canvas/agent-context/agent-text-selection";
import type { RenderedReviewDocument } from "@canvas/App";
import { documentStyles } from "@canvas/documents/document-styles";
import { ReviewDocumentBoundary } from "@canvas/documents/review-document-boundary";
import { reportReviewDocumentRenderError } from "@canvas/documents/review-document-error-report";
import { useReviewSession } from "@canvas/host/review-session";
import { cn } from "@canvas/lib/utils";
import { useReviewFindRegistration } from "@canvas/review/review-find";
import { useReviewPanelActor } from "@canvas/review/review-panel";
import { useReviewContainer } from "@canvas/review/review-root-context";
import { ReviewToc } from "@canvas/review/review-toc";
import { documentMarker } from "@canvas/styles/markers";
import { shellStyles } from "@canvas/styles/shell-styles";
import { type ReactElement, type RefObject, useEffect } from "react";

import { PageOverlay } from "./page-slots";

/**
 * The review document. It stays mounted while another page shows, so find,
 * embeds and diagrams keep their state.
 */
export function ChalkPage({
  document,
  articleRef,
  active,
  scratchpad,
  peekOpen,
}: {
  document: RenderedReviewDocument;
  articleRef: RefObject<HTMLElement | null>;
  active: boolean;
  scratchpad: boolean;
  peekOpen: boolean;
}): ReactElement {
  const session = useReviewSession();
  const panelActor = useReviewPanelActor();
  const documentRevision = document.key;

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

  const selectForAgent = useAgentSelection();
  useEffect(() => {
    const article = articleRef.current;

    if (!active || !article) return;

    return observeAgentTextSelection(article, selectForAgent);
  }, [active, documentRevision, articleRef, selectForAgent]);

  const reviewFind = useReviewFindRegistration();
  useEffect(() => {
    reviewFind?.setReviewActive(active);
  }, [active, reviewFind]);

  return (
    <>
      {active && (
        <PageOverlay>
          <ReviewToc
            entries={document.tocEntries ?? []}
            besideHeader={document.header}
            documentWidth={document.width}
          />
        </PageOverlay>
      )}
      <div
        className={cn(
          "review-document-view",
          shellStyles.documentView,
          !active && shellStyles.hidden,
        )}
        hidden={!active}
      >
        <article
          ref={articleRef}
          className={cn(
            "review-document",
            documentStyles.article,
            documentMarker,
            peekOpen && documentStyles.articlePeekOpen,
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
      </div>
    </>
  );
}
