import { cn } from "@canvas/lib/utils";
import { EmptyState } from "@canvas/ui/empty-state";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { documentStyles } from "./document-styles";

interface ReviewDocumentBoundaryProps {
  revision: string;
  onError: (revision: string, error: Error) => void;
  children: ReactNode;
}

interface ReviewDocumentBoundaryState {
  hasError: boolean;
  revision: string;
}

export class ReviewDocumentBoundary extends Component<
  ReviewDocumentBoundaryProps,
  ReviewDocumentBoundaryState
> {
  state: ReviewDocumentBoundaryState = {
    hasError: false,
    revision: this.props.revision,
  };
  private reportedRevision: string | undefined;

  static getDerivedStateFromError(): Pick<
    ReviewDocumentBoundaryState,
    "hasError"
  > {
    return { hasError: true };
  }

  static getDerivedStateFromProps(
    props: ReviewDocumentBoundaryProps,
    state: ReviewDocumentBoundaryState,
  ): ReviewDocumentBoundaryState | null {
    // New content gets a fresh render; the last failure was for the old revision.
    return props.revision === state.revision
      ? null
      : { hasError: false, revision: props.revision };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    if (this.reportedRevision === this.props.revision) return;
    this.reportedRevision = this.props.revision;
    this.props.onError(this.props.revision, error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <EmptyState
          variant="document"
          role="status"
          message={
            <>
              Your coding agent is writing the canvas now…
              <br />
              Edit the review through the Chalk MCP tools or{" "}
              <code className={documentStyles.code}>chalk api</code> to replace
              the failing block.
            </>
          }
        />
      );
    }

    return this.props.children;
  }
}
