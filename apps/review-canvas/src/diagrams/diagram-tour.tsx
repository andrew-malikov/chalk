import { useCanvasScrollLock } from "@canvas/lib/use-canvas-scroll-lock";
import { cn } from "@canvas/lib/utils";
import { GuidedTourPanel } from "@canvas/review/review-components";
import type { GuidedTour } from "@canvas/review/review-panel-model";
import { useReviewContainer } from "@canvas/review/review-root-context";
import { useRightPanelResize } from "@canvas/review/side-panel-resizer";
import { useReviewDebugSettings } from "@canvas/settings/debug-settings";
import { shellStyles } from "@canvas/styles/shell-styles";
import { themeStyles } from "@canvas/styles/theme-styles";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";

/**
 * Fullscreen guided tour shell shared by every diagram kind: the inline
 * figure as the stage on the left, the standard GuidedTourPanel on the
 * right, and the side-panel resizer between them. The shell owns layout
 * only — the stage is whatever the document already renders inline, and
 * the panel is the same component that hosts document tours, so scrolling
 * and selection behave identically everywhere.
 */
export function DiagramTourOverlay({
  flow = false,
  tour,
  activeAnchor,
  revealRequest,
  onActiveAnchorChange,
  onClose,
  children,
}: {
  /** A flow keeps its stage, stacked over the panel, when the canvas is narrow. */
  flow?: boolean;
  tour: GuidedTour;
  activeAnchor: string;
  revealRequest: number;
  onActiveAnchorChange: (anchor: string, options: { reveal: boolean }) => void;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  // The overlay portals into .review-canvas-root, OUTSIDE .review-app — the
  // element the theme modifier lives on. Carrying the modifier here keeps the
  // light theme's token overrides in scope for the stage and the panel.
  const { theme } = useReviewDebugSettings();
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Here, not in the diagram that opens the tour: each resize step re-renders
  // only the overlay, and the stage it was handed stays put.
  const paneResize = useRightPanelResize({
    stateKey: "diagram-tour-pane-width",
    defaultWidth: 594,
    minWidth: 360,
    maxWidth: 760,
    maxContainerFraction: 0.5,
    minMainWidth: 480,
    separatorWidth: 10,
    label: "Resize tour pane",
    containerRef: overlayRef,
  });

  // SAFETY: `--diagram-tour-pane-width` is a CSS custom property, which React
  // forwards to style.setProperty; the CSSProperties typings only omit custom
  // names.
  const overlayStyle = {
    "--diagram-tour-pane-width": `${paneResize.width}px`,
  } as CSSProperties;

  return (
    <div
      ref={overlayRef}
      className={cn(
        `diagram-tour-overlay review-app--theme-${theme}`,
        theme === "light" && themeStyles.light,
        styles.overlay,
        flow && styles.flowOverlay,
      )}
      role="dialog"
      aria-modal="true"
      aria-label={`${tour.title ?? "Guided"} tour`}
      style={overlayStyle}
    >
      <div className={cn(styles.stage, flow && styles.flowStage)}>
        {children}
      </div>
      <div
        className={cn(
          shellStyles.resizer,
          shellStyles.resizerGrabPanel,
          styles.resizer,
        )}
        {...paneResize.separatorProps}
      />
      <div className={styles.panel}>
        <GuidedTourPanel
          tour={tour}
          activeAnchor={activeAnchor}
          revealRequest={revealRequest}
          onActiveAnchorChange={onActiveAnchorChange}
          onClose={onClose}
          docked
        />
      </div>
    </div>
  );
}

/**
 * Chrome every fullscreen diagram tour shares: the canvas-root portal
 * target, Escape-to-close and the canvas scroll lock.
 */
export function useDiagramTourShell(open: boolean, onClose: () => void) {
  // The desktop build wraps every canvas rule in @scope (.review-canvas-root),
  // so the overlay must portal INSIDE the canvas root or it renders unstyled.
  const portalTarget = useReviewContainer();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useCanvasScrollLock(open);

  return { portalTarget };
}

// Portals inside .review-canvas-root but outside .review-app, where
// --review-debug-layer lives, hence the literal fallback.
const styles = {
  overlay:
    "tw:fixed tw:inset-0 tw:z-[var(--review-debug-layer,_2147483000)] tw:box-border tw:grid tw:grid-cols-[minmax(0,_1fr)_10px_var(--diagram-tour-pane-width,_424px)] tw:[@container_review-canvas_(max-width:_1080px)]:grid-cols-[minmax(0,_1fr)] tw:min-w-0 tw:min-h-0 tw:overflow-hidden tw:bg-[color:var(--bg)]",
  flowOverlay:
    "tw:[@container_review-canvas_(max-width:_1080px)]:grid-rows-[minmax(180px,_40%)_minmax(0,_1fr)]",
  stage:
    "tw:flex tw:[@container_review-canvas_(max-width:_1080px)]:hidden tw:flex-col tw:min-w-0 tw:min-h-0",
  flowStage: "tw:flex",
  resizer: "tw:[@container_review-canvas_(max-width:_1080px)]:hidden",
  // Positioned so the panel's floating pager centers on this column.
  panel: "tw:relative tw:flex tw:flex-col tw:min-w-0 tw:min-h-0",
};
