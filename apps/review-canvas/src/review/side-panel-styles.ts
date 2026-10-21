export const panelStyles = {
  panel:
    "tw:flex tw:flex-col tw:min-w-0 tw:h-full tw:[&:is(.canvas-detail-host:is(*)_*)]:[grid-area:1_/_1] tw:overflow-hidden tw:bg-[color:var(--bg)] tw:[animation-name:side-panel-styles-slide-in] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:200ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:ease-out] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease]",
  sheet:
    "tw:[@container_review-canvas_(max-width:_929px)]:absolute tw:[@media_(max-width:_720px)]:absolute tw:[@container_review-canvas_(max-width:_929px)]:inset-[auto_0_0_0] tw:[@container_review-canvas_(max-width:_929px)]:[@media_(max-height:_560px)]:inset-0 tw:[@media_(max-width:_720px)]:inset-[auto_0_0_0] tw:[@media_(max-width:_720px)]:[@media_(max-height:_560px)]:inset-0 tw:[@media_(max-height:_560px)]:inset-0 tw:[@container_review-canvas_(max-width:_929px)]:z-[50] tw:[@media_(max-width:_720px)]:z-[50] tw:[@container_review-canvas_(max-width:_929px)]:h-[calc(var(--side-panel-bottom-fraction,_0.5)_*_100%)] tw:[@container_review-canvas_(max-width:_929px)]:[@media_(max-height:_560px)]:h-full tw:[@media_(max-width:_720px)]:h-[calc(var(--side-panel-bottom-fraction,_0.5)_*_100%)] tw:[@media_(max-width:_720px)]:[@media_(max-height:_560px)]:h-full tw:[@container_review-canvas_(max-width:_929px)]:max-h-full tw:[@container_review-canvas_(max-width:_929px)]:[@media_(max-height:_560px)]:max-h-none tw:[@media_(max-width:_720px)]:max-h-full tw:[@media_(max-width:_720px)]:[@media_(max-height:_560px)]:max-h-none tw:[@media_(max-height:_560px)]:max-h-none",
  restored:
    "tw:[animation-name:none] tw:[animation-duration:0s] tw:[animation-timing-function:ease]",
  tour: "tw:relative tw:[@container_review-canvas_(max-width:_929px)]:absolute tw:[@media_(max-width:_720px)]:absolute",
  // Inside a diagram tour the panel keeps its column at every width.
  docked: "tw:static tw:inset-[auto] tw:w-full tw:h-full tw:max-h-none",
  header:
    "tw:flex tw:flex-[0_0_auto] tw:items-center tw:justify-between tw:gap-[12px] tw:min-h-[var(--review-header-height)] tw:p-[0_10px_0_16px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:bg-[color:var(--surface)]",
  title: "tw:flex tw:items-center tw:gap-[9px] tw:min-w-0",
  kicker: "tw:flex-[0_0_auto] tw:font-[family-name:var(--font-sans)]",
  heading:
    "tw:overflow-hidden tw:m-0 tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:13px] tw:font-semibold tw:leading-[1.3] tw:whitespace-nowrap tw:text-ellipsis",
  close: "tw:flex-[0_0_auto]",
  actions: "tw:flex tw:flex-[0_0_auto] tw:items-center tw:gap-[2px]",
  // A conversation sits on the tray, header and all.
  tray: "tw:bg-[color:var(--tray)]",
  trayKicker:
    "tw:text-[color:var(--ink-muted)] tw:text-[length:11px] tw:font-normal",
  // The conversation scrolls its own thread; the composer stays put.
  trayBody: "tw:flex tw:flex-col tw:pb-0 tw:overflow-hidden",
  body: "tw:pb-[var(--review-bottom-scroll-padding,_0px)] tw:flex-[1_1_auto] tw:min-w-0 tw:min-h-0 tw:overflow-x-hidden tw:overflow-y-auto tw:[overscroll-behavior:contain]",
  peekBody: "tw:min-w-0 tw:p-[12px] tw:[@media_(max-width:_720px)]:p-[8px]",
  peekActions: "tw:flex tw:justify-end tw:mb-[12px]",
  peekContent: "tw:min-w-0",
};

// The guided tour: a numbered rail of stops in the panel body, and a pager
// pill floating over its foot.
export const tourStyles = {
  feedShell:
    "tw:flex tw:flex-[1_1_auto] tw:flex-col tw:min-h-0 tw:[border-top-width:1px] tw:[border-top-style:solid] tw:[border-top-color:var(--rule)]",
  feed: "tw:p-[0_0_72px] tw:scroll-pt-[18px] tw:scroll-pb-[72px]",
  floatingFooter:
    "tw:absolute tw:right-0 tw:bottom-[12px] tw:[@media_(max-width:_720px)]:bottom-[8px] tw:left-0 tw:z-[4] tw:flex tw:justify-center tw:p-[0_12px] tw:[@media_(max-width:_720px)]:p-[0_8px] tw:pointer-events-none",
  pill: "tw:flex tw:items-center tw:gap-[8px] tw:p-[4px_10px] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:rounded-[999px] tw:bg-[color:var(--accent)] tw:[box-shadow:0_8px_24px_var(--shadow-color-strong)] tw:text-[color:var(--on-accent)] tw:text-[length:11px] tw:font-bold tw:pointer-events-auto",
  pillIntro: "tw:gap-[7px] tw:p-[7px_14px] tw:cursor-pointer",
  pillChevron: "tw:text-[color:var(--on-accent)]",
  // An IconButton on the accent pill.
  pillButton:
    "tw:rounded-[50%] tw:bg-[color:var(--transparent)] tw:[&:hover:not(:disabled)]:bg-[color:color-mix(in_srgb,_var(--on-accent)_16%,_var(--transparent))] tw:[&:focus-visible]:bg-[color:color-mix(in_srgb,_var(--on-accent)_16%,_var(--transparent))] tw:text-[color:var(--on-accent)] tw:text-[length:inherit] tw:font-[number:inherit]",
  endCap:
    "tw:flex tw:items-center tw:justify-between tw:gap-[12px] tw:m-[8px_0_16px] tw:p-[12px_16px] tw:border-[1px] tw:border-dashed tw:border-[color:var(--rule-soft)] tw:rounded-[10px] tw:text-[color:var(--ink-muted)] tw:text-[length:11px] tw:font-bold",
  endCapButton:
    "tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:var(--transparent)] tw:[box-shadow:none] tw:text-[color:var(--accent)] tw:font-[family-name:inherit] tw:text-[length:inherit] tw:font-[number:inherit] tw:leading-[inherit] tw:[font-style:inherit] tw:cursor-pointer tw:whitespace-nowrap",
  scrollTail: "tw:shrink-0",
  stop: "tw:grid tw:grid-cols-[56px_minmax(0,_1fr)] tw:[@media_(max-width:_720px)]:grid-cols-[38px_minmax(0,_1fr)] tw:pr-[16px] tw:[@media_(max-width:_720px)]:pr-[8px]",
  rail: "tw:relative tw:flex tw:justify-center tw:[&::before]:absolute tw:[&::before]:top-0 tw:[&::before]:bottom-0 tw:[&::before]:left-[29px] tw:[@media_(max-width:_720px)]:[&::before]:left-[19px] tw:[&::before]:w-[2px] tw:[&::before]:bg-[color:var(--rule-soft)] tw:[&::before]:[content:'']",
  railNumber:
    "tw:z-[1] tw:grid tw:place-items-center tw:size-[26px] tw:mt-[18px] tw:border-[2px] tw:border-solid tw:border-[color:var(--rule-soft)] tw:rounded-[50%] tw:bg-[color:var(--bg)] tw:[box-shadow:0_0_0_4px_var(--bg)] tw:text-[color:var(--ink-faint)] tw:text-[length:12px] tw:font-bold",
  // The rail stops at the end cap instead of trailing off past the last stop.
  railEnd: "tw:items-center tw:[&::before]:bottom-1/2",
  railDone: "tw:mt-0",
  railNumberActive:
    "tw:border-[color:var(--accent)] tw:bg-[color:var(--accent)] tw:text-[color:var(--on-accent)]",
  main: "tw:min-w-0 tw:pt-[16px] tw:pr-0 tw:pb-[22px] tw:pl-[4px] tw:[@media_(max-width:_720px)]:pl-0",
  mainActive: "tw:rounded-[10px]",
  // The stop's content breaks out over the rail to the panel's inner edge.
  content:
    "tw:relative tw:z-[2] tw:w-[calc(100%_+_50px)] tw:[@media_(max-width:_720px)]:w-[calc(100%_+_30px)] tw:ml-[calc(-1_*_50px)] tw:[@media_(max-width:_720px)]:ml-[calc(-1_*_30px)] tw:bg-[color:var(--bg)]",
  header:
    "tw:flex tw:items-start tw:justify-between tw:gap-[14px] tw:mb-[12px]",
  titleRow: "tw:flex tw:items-center tw:gap-[8px]",
  title:
    "tw:m-[3px_0_0] tw:text-[color:var(--ink)] tw:text-[length:18px] tw:leading-[24px]",
  titleActive: "tw:text-[color:var(--accent)]",
  detail:
    "tw:m-[6px_0_0] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:leading-[15px]",
};
