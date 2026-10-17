// The box of anything that floats over the canvas. Sites keep their own
// placement, size and padding, applied after these.
export const surfaceStyles = {
  popover:
    "tw:border-[1px] tw:border-solid tw:border-[color:var(--rule-soft)] tw:rounded-[8px] tw:bg-[color:var(--surface-raised)] tw:[box-shadow:0_8px_24px_var(--shadow-color-strong)] tw:text-[color:var(--ink)]",
  dialog:
    "tw:border-[1px] tw:border-solid tw:border-[color:var(--rule-soft)] tw:rounded-[8px] tw:bg-[color:var(--surface-raised)] tw:[box-shadow:0_18px_60px_var(--shadow-color-strong)] tw:text-[color:var(--ink)]",
};
