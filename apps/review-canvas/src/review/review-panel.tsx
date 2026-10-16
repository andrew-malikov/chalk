import { REVIEW_CANVAS_RESUME_EVENT } from "@chalk/review-contracts";
import { useActorRef, useSelector } from "@xstate/react";
import {
  type ReactNode,
  type RefObject,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  type ReviewNavigationRestore,
  type ReviewPanelActor,
  type ReviewPanelSnapshot,
  createReviewPanelMachine,
} from "./review-panel-machine";

const ReviewPanelContext = createContext<ReviewPanelActor | null>(null);

export function ReviewPanelProvider({
  children,
  restore,
}: {
  children: ReactNode;
  /** Read storage once per mount; live edits re-render the canvas often. */
  restore?: () => ReviewNavigationRestore;
}) {
  const [machine] = useState(() => createReviewPanelMachine(restore?.()));
  const actor = useActorRef(machine);

  return (
    <ReviewPanelContext.Provider value={actor}>
      {children}
    </ReviewPanelContext.Provider>
  );
}

export function useReviewPanel<T>(
  selector: (snapshot: ReviewPanelSnapshot) => T,
): T {
  return useSelector(useReviewPanelActor(), selector);
}

export function useOptionalReviewPanelActor(): ReviewPanelActor | null {
  return useContext(ReviewPanelContext);
}

export function useOptionalReviewPanel<T>(
  selector: (snapshot: ReviewPanelSnapshot) => T,
): T | undefined {
  const actor = useOptionalReviewPanelActor();

  return useSelector(actor ?? undefined, (snapshot) =>
    snapshot ? selector(snapshot) : undefined,
  );
}

export function useReviewPanelActor(): ReviewPanelActor {
  const actor = useOptionalReviewPanelActor();

  if (!actor) {
    throw new Error(
      "Review panel components must render inside ReviewPanelProvider",
    );
  }

  return actor;
}

export function useSuppressPanelMotionOnCanvasResume(
  appRef: RefObject<HTMLElement | null>,
): void {
  const actor = useReviewPanelActor();
  useEffect(() => {
    const canvasRoot = appRef.current?.closest(".review-canvas-root");

    if (!canvasRoot) return;
    const suppressMotion = () => actor.send({ type: "suppressMotion" });
    canvasRoot.addEventListener(REVIEW_CANVAS_RESUME_EVENT, suppressMotion);

    return () =>
      canvasRoot.removeEventListener(
        REVIEW_CANVAS_RESUME_EVENT,
        suppressMotion,
      );
  }, [appRef, actor]);
}
