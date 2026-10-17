import { drawStyles } from "@canvas/drawing/draw-styles";
import { cn } from "@canvas/lib/utils";

/**
 * The map's section, shared by the map and its unavailable notice. The
 * `software-map` class stays as the e2e journeys' and tests' hook.
 */
export function softwareMapRootProps(className?: string, variant?: "view") {
  return {
    className: cn(
      "software-map",
      className,
      styles.root,
      variant === "view" && styles.view,
      drawStyles.blockChild,
    ),
  };
}

const styles = {
  root: "tw:m-[24px_0] tw:font-[family-name:var(--font-sans)] tw:[&:is(.canvas-document:is(*)_*)]:w-fit tw:[@media_(max-width:_720px)]:[&:is(.canvas-document:is(*)_*)]:w-[calc(100cqi_-_16px)] tw:[&:is(.canvas-document:is(*)_*)]:max-w-[min(var(--review-inline-diagram-max-width),_calc(100cqi_-_var(--review-document-padding-inline)_-_var(--review-document-padding-inline)))] tw:[@media_(max-width:_720px)]:[&:is(.canvas-document:is(*)_*)]:max-w-none tw:[&:is(.canvas-document:is(*)_*)]:min-w-[min(var(--review-prose-max-width),_calc(100cqi_-_var(--review-document-padding-inline)_-_var(--review-document-padding-inline)))] tw:[&:is(.canvas-document:is(*)_*)]:mx-[auto]",
  // The map view fills its canvas shell.
  view: "tw:flex-[1] tw:min-h-0 tw:h-full tw:m-0",
};
