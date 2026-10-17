// The header every diagram figure shares: a kind badge, the title and a quiet
// count, then its 24px hairline controls (the tour button, the use-case
// select).
export const diagramStyles = {
  header:
    "tw:relative tw:top-[auto] tw:left-[auto] tw:z-[6] tw:flex tw:items-center tw:gap-[10px] tw:min-w-0 tw:min-h-[36px] tw:p-[0_12px_0_14px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:bg-[color:var(--surface)] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:tracking-[0]",
  headerMain:
    "tw:inline-flex tw:flex-[1_1_auto] tw:items-center tw:gap-[10px] tw:min-w-0",
  title:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--ink)] tw:text-[length:12px] tw:not-italic tw:font-semibold tw:leading-[18px] tw:text-ellipsis tw:whitespace-nowrap",
  // A quiet count ("5 stops", "4 nodes"), not a chip.
  meta: "tw:flex-[0_0_auto] tw:ml-[auto] tw:p-0 tw:border-[0] tw:border-none tw:rounded-none tw:bg-[color:var(--transparent)] tw:text-[color:var(--ink-faint)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[normal] tw:not-italic tw:tracking-[0] tw:normal-case",
  control:
    "tw:flex-[0_0_auto] tw:h-[24px] tw:p-[0_10px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule-soft)] tw:[&:focus-visible]:border-[color:var(--accent)] tw:rounded-[6px] tw:bg-[color:var(--surface)] tw:[&:hover]:bg-[color:var(--well)] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-medium tw:leading-[normal] tw:leading-[22px] tw:cursor-pointer tw:[&:focus-visible]:[outline:none]",
  select:
    "tw:w-full tw:min-w-0 tw:pr-[26px] tw:overflow-hidden tw:appearance-none tw:[background-image:var(--chevron-down)] tw:[background-repeat:no-repeat] tw:[background-position:right_8px_center] tw:[background-size:12px_12px] tw:text-ellipsis",
};
