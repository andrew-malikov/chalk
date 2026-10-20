import { ReviewCommitsView } from "@canvas/diff/ReviewCommitsView";
import { useReviewPanelActor } from "@canvas/review/review-panel";
import type {
  ReviewCanvasRange,
  ReviewCommitSummary,
} from "@chalk/review-contracts";
import type { ReactElement } from "react";

export function CommitsPage({
  commits,
  range,
}: {
  commits: readonly ReviewCommitSummary[];
  range: ReviewCanvasRange;
}): ReactElement {
  const panelActor = useReviewPanelActor();

  return (
    <ReviewCommitsView
      commits={commits}
      range={range}
      onOpenDiff={(commit, file) => {
        panelActor.send({ type: "openCommitDiff", scope: { commit, file } });
      }}
    />
  );
}
