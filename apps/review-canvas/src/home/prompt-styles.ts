// The prompt card and the connect card: a segmented row of tabs, the prompt
// quoted under them, and the copy action.
export const promptStyles = {
  // A segmented control that hugs its tabs.
  tabs: "tw:w-fit tw:max-w-full tw:mb-[10px]",
  // The prompt is the artifact, not chrome: a quote rule separates it from
  // the step's own copy without putting the card frame back.
  body: "tw:m-0 tw:p-[2px_0_2px_14px] tw:[border-left-width:2px] tw:[border-left-style:solid] tw:[border-left-color:var(--review-home-rule-soft)] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:13px] tw:font-normal tw:leading-[22px] tw:[text-wrap:pretty] tw:whitespace-pre-wrap tw:select-text",
  actions: "tw:flex tw:justify-end tw:p-[18px_0_4px]",
  copy: "tw:inline-flex tw:gap-[6px] tw:items-center tw:p-[6px_14px] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:rounded-[6px] tw:text-[color:var(--on-accent)] tw:bg-[color:var(--accent)] tw:font-[family-name:var(--font-sans)] tw:text-[length:12px] tw:font-medium tw:leading-[16px] tw:[text-decoration:none] tw:[&:focus-visible]:[outline:1px_solid_var(--accent)] tw:[&:focus-visible]:outline-offset-[2px]",
  error:
    "tw:m-[10px_0_0] tw:text-[color:var(--change-removed)] tw:text-[length:12px] tw:whitespace-pre-wrap",
};
