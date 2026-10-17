// Type roles shared by elements of every kind. Sites keep their own layout
// and font family, applied after these.
export const textStyles = {
  // The uppercase micro label over a panel, group or figure.
  eyebrow:
    "tw:text-[color:var(--ink-faint)] tw:text-[length:10px] tw:font-semibold tw:tracking-[0.08em] tw:uppercase",
  // A count that changes in place; its digits keep their width.
  count: "tw:tabular-nums",
};
