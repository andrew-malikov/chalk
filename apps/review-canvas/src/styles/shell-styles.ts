export const shellStyles = {
  // Narrow layouts dock the panel to the bottom half of the canvas as a
  // sheet, so the peek column collapses.
  appPeekOpen:
    "tw:grid-cols-[minmax(0,_1fr)_10px_var(--side-peek-width,_560px)] tw:[@container_review-canvas_(max-width:_929px)]:grid-cols-[minmax(0,_1fr)_0_0] tw:[@container_review-canvas_(max-width:_929px)]:[@media_(max-width:_720px)]:grid-cols-[minmax(0,_1fr)] tw:[@media_(max-width:_720px)]:grid-cols-[minmax(0,_1fr)]",
  // Lit on the separator itself: a condition on the root would restyle the
  // whole canvas as a drag starts and ends.
  peekResizerActive: "tw:[&::before]:bg-[color:var(--ink-faint)]",
  // No inherited cursor or user-select here, for the same reason; the
  // separator's pointer capture keeps its cursor and blocks selection.
  appResizing: "tw:[transition:none]",
  appRestoredPanel: "tw:[transition:none]",
  apiCanvas: "tw:flex tw:flex-col tw:h-full tw:min-h-0",
  documentShell:
    "tw:relative tw:grid tw:grid-cols-[minmax(0,_1fr)] tw:grid-rows-[auto_minmax(0,_1fr)] tw:min-w-0 tw:h-full tw:overflow-hidden tw:[container:review-content_/_inline-size]",
  documentShellBanner: "tw:grid-rows-[auto_auto_minmax(0,_1fr)]",
  // The host's own box lives in the collapsed third grid column on narrow
  // layouts; dissolving it lets the sheet position against the app instead
  // of a 0-width, overflow-hidden ancestor.
  detailHost:
    "tw:relative tw:grid tw:[@container_review-canvas_(max-width:_929px)]:[display:contents] tw:[@media_(max-width:_720px)]:[display:contents] tw:min-w-0 tw:h-full tw:overflow-hidden",
  // The vertical divider between a pane and its side panel.
  resizer:
    "tw:relative tw:[@container_review-canvas_(max-width:_929px)]:[&:is(.canvas-app[data-peek-open]_*)]:hidden tw:[@media_(max-width:_720px)]:[&:is(.canvas-app[data-peek-open]_*)]:hidden tw:w-[10px] tw:min-w-[10px] tw:z-[1] tw:[cursor:col-resize] tw:bg-[color:var(--transparent)] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:[touch-action:none] tw:[&:focus-visible]:[outline:1px_solid_var(--rule-soft)] tw:[&:focus-visible]:outline-offset-[-1px] tw:[&::before]:absolute tw:[&::before]:top-0 tw:[&::before]:bottom-0 tw:[&::before]:left-[50%] tw:[&::before]:w-[1px] tw:[&:hover::before]:w-[3px] tw:[&:focus-visible::before]:w-[3px] tw:[&:active::before]:w-[3px] tw:[&::before]:bg-[color:var(--rule)] tw:[&:hover::before]:bg-[color:var(--ink-faint)] tw:[&:focus-visible::before]:bg-[color:var(--ink-faint)] tw:[&:active::before]:bg-[color:var(--ink-faint)] tw:[&::before]:[transform:translateX(-50%)] tw:[&::before]:[transition-property:width,_background-color] tw:[&::before]:[transition-duration:120ms] tw:[&::before]:[transition-delay:0s] tw:[&:hover::before]:[transition-delay:120ms] tw:[&::before]:[content:'']",
  // Rule flush left; grabs rightward over the panel's padding, never the
  // scrollbar.
  resizerGrabPanel:
    "tw:[&::before]:left-0 tw:[&::before]:[transform:none] tw:[&::after]:absolute tw:[&::after]:top-0 tw:[&::after]:bottom-0 tw:[&::after]:left-0 tw:[&::after]:right-[-8px] tw:[&::after]:[content:'']",
  // The column continues the panel and its header.
  peekResizer:
    "tw:h-full tw:border-[color:var(--transparent)] tw:[background-image:linear-gradient(var(--surface)_calc(var(--review-header-height)_-_1px),_var(--rule)_0_var(--review-header-height),_var(--transparent)_0)]",
  // Horizontal twin of the divider for the narrow-layout bottom sheet: it
  // drags the sheet height. Hidden on wide layouts, where the vertical
  // divider owns resizing.
  sheetResizer:
    "tw:relative tw:hidden tw:[@container_review-canvas_(max-width:_929px)]:block tw:[@media_(max-width:_720px)]:block tw:flex-[0_0_auto] tw:h-[10px] tw:min-h-[10px] tw:[cursor:row-resize] tw:bg-[color:var(--transparent)] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:[touch-action:none] tw:[&:focus-visible]:[outline:1px_solid_var(--rule-soft)] tw:[&:focus-visible]:outline-offset-[-1px] tw:[&::before]:absolute tw:[&::before]:top-[50%] tw:[&::before]:right-0 tw:[&::before]:left-0 tw:[&::before]:h-[1px] tw:[&::before]:bg-[color:var(--rule)] tw:[&:hover::before]:bg-[color:var(--ink-faint)] tw:[&:focus-visible::before]:bg-[color:var(--ink-faint)] tw:[&::before]:[transform:translateY(-50%)] tw:[&::before]:[content:'']",
  // Three dots stand in for a divider's rule, hidden until hover or drag.
  resizerDots:
    "tw:[&::before]:top-[50%] tw:[&::before]:bottom-[auto] tw:[&::before]:left-[50%] tw:[&::before]:right-[auto] tw:[&::before]:w-[3px] tw:[&::before]:h-[18px] tw:[&::before]:[transform:translate(-50%,-50%)] tw:[&::before]:bg-[color:var(--transparent)] tw:[&::before]:[mask:radial-gradient(circle,#000_1px,transparent_1.5px)_0_0/3px_6px]",
  sheetResizerDots:
    "tw:[&::before]:top-[50%] tw:[&::before]:left-[50%] tw:[&::before]:right-[auto] tw:[&::before]:w-[18px] tw:[&::before]:h-[3px] tw:[&::before]:[transform:translate(-50%,-50%)] tw:[&::before]:bg-[color:var(--transparent)] tw:[&::before]:[mask:radial-gradient(circle,#000_1px,transparent_1.5px)_0_0/6px_3px]",
  // Dragged dots grow and darken; important beats the hover tint.
  resizerDotsActive:
    "tw:[&::before]:bg-[color:var(--ink)]! tw:[&::before]:[scale:1.5]",
  // The diff view shares one surface across topbar, sidebar and panel, so no
  // rules between them.
  topbarFlush: "tw:[border-bottom-width:0]",
  peekResizerFlush: "tw:[background-image:none]",
  // With the tabs and actions in the host's command bar, only the diff view
  // keeps a toolbar. Collapsed rather than unmounted, so its portals stay.
  topbarHidden: "tw:h-0 tw:invisible tw:[border-bottom-width:0]",
  topbar:
    "tw:sticky tw:top-0 tw:z-[var(--review-debug-layer)] tw:flex tw:items-center tw:justify-between tw:gap-[8px] tw:h-[var(--review-header-height)] tw:p-[0_12px_0_16px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:bg-[color:var(--surface)]",
  topbarLeft: "tw:flex tw:flex-[0_0_auto] tw:items-center",
  topbarActions:
    "tw:flex tw:items-center tw:gap-[10px] tw:flex-[1_1_auto] tw:min-w-0 tw:h-full tw:overflow-x-auto",
  // Every item in the action row keeps its size.
  topbarItem: "tw:[&:is(.canvas-topbar-actions:is(*)_*)]:flex-[0_0_auto]",
  // Popovers in the action row hang below their control, anchored by
  // useAnchoredPopover.
  topbarPopover:
    "tw:[&:is(.canvas-topbar-actions:is(*)_*)]:fixed tw:[&:is(.canvas-topbar-actions:is(*)_*)]:top-[calc(anchor(bottom)_+_4px)] tw:[&:is(.canvas-topbar-actions:is(*)_*)]:right-[anchor(right)] tw:[&:is(.canvas-topbar-actions:is(*)_*)]:bottom-[auto] tw:[&:is(.canvas-topbar-actions:is(*)_*)]:left-[auto] tw:[&:is(.canvas-topbar-actions:is(*)_*)]:m-0 tw:[&:is(.canvas-topbar-actions:is(*)_*)]:max-w-[calc(100vw_-_16px)] tw:[&:is(.canvas-topbar-actions:is(*)_*)]:[position-try-fallbacks:flip-inline,_flip-block] tw:[&:is(.canvas-topbar-actions:is(*)_*)]:[position-visibility:anchors-visible]",
  // The scratchpad has no source tree or pins to set apart, so no rule.
  topbarContext:
    "tw:flex tw:flex-[0_0_auto] tw:min-w-0 tw:items-center tw:mr-[auto] tw:[&:empty::before]:hidden tw:[&::before]:[content:''] tw:[&::before]:flex-[0_0_1px] tw:[&::before]:h-[20px] tw:[&::before]:m-[0_14px_0_16px] tw:[&::before]:bg-[color:var(--chrome-border)]",
  actionsDivider:
    "tw:shrink-0 tw:w-[1px] tw:h-[16px] tw:bg-[color:var(--chrome-border)]",
  viewRegion: "tw:relative tw:min-w-0 tw:min-h-0 tw:overflow-hidden",
  commitsRegion: "tw:overflow-auto",
  // --review-toc-tail is the room the contents rail adds so the last heading
  // can scroll up to the top edge, measured by the rail itself.
  reviewRegion:
    "tw:flex tw:items-start tw:justify-center tw:gap-0 tw:min-w-0 tw:overflow-x-hidden tw:overflow-y-auto tw:[scrollbar-width:thin] tw:p-[var(--review-page-top)_52px_calc(max(120px,_var(--review-bottom-scroll-padding,_0px))_+_var(--review-toc-tail,_0px))] tw:[@container_review-content_(max-width:_1180px)]:p-[var(--review-page-top)_42px_120px] tw:[@container_review-content_(max-width:_1180px)]:[@container_review-content_(max-width:_1080px)]:p-[var(--review-page-top)_24px_120px] tw:[@container_review-content_(max-width:_1180px)]:[@container_review-content_(max-width:_1080px)]:[@media_(max-width:_720px)]:p-[22px_8px_calc(96px_+_var(--review-toc-tail,_0px))] tw:[@media_(max-width:_720px)]:p-[22px_8px_calc(96px_+_var(--review-toc-tail,_0px))]",
  documentView: "tw:[display:contents]",
  hidden: "tw:hidden",
  mapView:
    "tw:relative tw:grid tw:grid-rows-[minmax(0,_1fr)] tw:w-full tw:h-full tw:min-h-0 tw:overflow-hidden",
  // Anchors the floating map settings control.
  mapCanvasShell:
    "tw:relative tw:flex tw:flex-col tw:[grid-row:1] tw:min-h-0 tw:overflow-hidden",
  diffView:
    "tw:relative tw:grid tw:grid-rows-[minmax(0,_1fr)] tw:w-full tw:h-full tw:min-h-0 tw:overflow-hidden",
  // Keep the full diff alive while another view is selected. It initializes
  // in the review page's loading window, then the first Diff click and every
  // return reuse the same file tree, editor models, selection, and scroll
  // state.
  diffViewPreloaded:
    "tw:absolute tw:inset-0 tw:opacity-0 tw:invisible tw:pointer-events-none",
  diffViewScoped: "tw:grid-rows-[30px_minmax(0,_1fr)]",
};
