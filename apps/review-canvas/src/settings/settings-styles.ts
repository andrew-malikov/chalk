// Settings page: flat rows, no cards. One narrow column, a small-caps label per
// section, and a fixed right lane so every control lines up. Shared with the
// diffr section, which lays its rows out the same way.
export const settingsStyles = {
  page: "tw:w-[min(820px,_100%)]",
  lede: "tw:m-[0_0_28px] tw:text-[color:var(--review-home-meta)] tw:text-[length:13px]",
  section: "tw:mb-[28px]",
  sectionLabel:
    "tw:m-[0_0_2px] tw:pb-[6px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--review-home-rule)] tw:text-[color:var(--review-home-meta)]",
  row: "tw:grid tw:grid-cols-[minmax(0,_1fr)_minmax(200px,_max-content)] tw:items-center tw:gap-[24px] tw:p-[14px_0] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--review-home-rule-soft)]",
  rowText: "tw:flex tw:flex-col tw:gap-[3px] tw:min-w-0",
  rowLabel: "tw:text-[color:var(--ink)] tw:text-[length:13px]",
  rowDescription:
    "tw:text-[color:var(--review-home-meta)] tw:text-[length:12px]",
  rowControl: "tw:flex tw:items-center tw:justify-end",
  toggle:
    "tw:flex tw:items-center tw:gap-[8px] tw:text-[color:var(--review-home-meta)] tw:text-[length:12px] tw:cursor-pointer",
  input: "tw:min-w-[200px]",
  diffr:
    "tw:mt-[8px] tw:pl-[12px] tw:[border-left-width:2px] tw:[border-left-style:solid] tw:[border-left-color:var(--review-home-rule-soft)]",
  diffrSummary: "tw:cursor-pointer tw:py-[8px]",
  unavailable: "tw:text-[color:var(--review-home-meta)] tw:text-[length:12px]",
  error:
    "tw:m-[4px_0_0] tw:text-[color:var(--change-removed)] tw:text-[length:12px] tw:whitespace-pre-wrap",
  summaryFields:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:p-0 tw:m-0 tw:min-w-0",
  summaryActions: "tw:flex tw:gap-[8px]",
  prompt: "tw:flex tw:flex-col tw:gap-[4px] tw:mt-[8px]",
  summaryResult: "tw:whitespace-pre-wrap tw:[overflow-wrap:anywhere]",
};
