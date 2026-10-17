// Controls shared across the canvas.
export const controlStyles = {
  // Segmented choice controls: a tray-colored track, the chosen side raised
  // on a hairline. One part for every "pick one of a few" setting. The
  // surface tabs on the left of the top bar are the exception: words on the
  // tray with the marker under the current one.
  segmented:
    "tw:flex tw:flex-[0_0_auto] tw:items-center tw:gap-0 tw:p-[2px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[6px] tw:bg-[color:var(--tray)]",
  segmentedTopbar:
    "tw:gap-[18px] tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:rounded-none tw:bg-[color:var(--transparent)]",
  segment:
    "tw:inline-flex tw:items-center tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:var(--transparent)] tw:font-[family-name:var(--chrome-font)] tw:whitespace-nowrap tw:relative tw:gap-[6px] tw:h-[20px] tw:p-[0_10px] tw:rounded-[4px] tw:text-[color:var(--ink-muted)] tw:[&:hover]:text-[color:var(--ink)] tw:text-[length:11px] tw:font-medium tw:[&:disabled]:opacity-[0.5] tw:[&:disabled]:cursor-default tw:[&:focus-visible]:[outline:1px_solid_var(--accent)] tw:[&:focus-visible]:outline-offset-[-1px]",
  // Segments set in prose (the welcome and tutorial pages) grow a step.
  segmentLarge: "tw:h-[26px] tw:p-[0_12px] tw:text-[length:13px]",
  segmentTopbar:
    "tw:h-[var(--review-header-height)] tw:p-0 tw:rounded-none tw:[&:focus-visible]:rounded-[4px] tw:text-[length:12px] tw:font-normal",
  segmentActive:
    "tw:bg-[color:var(--raised)] tw:[box-shadow:0_0_0_1px_var(--rule-soft)] tw:text-[color:var(--ink)] tw:font-semibold",
  segmentTopbarActive: "tw:bg-[color:var(--transparent)] tw:[box-shadow:none]",
  segmentCount:
    "tw:flex-[0_0_auto] tw:tabular-nums tw:text-[color:var(--ink-faint)] tw:text-[length:12px] tw:font-normal",
  segmentCountActive: "tw:text-[color:var(--accent)]",
  // The icon never takes the pointer from its button.
  inertIcon: "tw:pointer-events-none",
  // Icons in top bar chrome buttons.
  chromeIcon: "tw:size-[var(--chrome-icon-size)]",
  // Icons beside a label, in a button or chip.
  inlineIcon: "tw:size-[12px]",
};
