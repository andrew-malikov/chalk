// The page shell Home, Welcome and Settings share.
export const homeStyles = {
  page: "tw:flex tw:flex-col tw:h-full tw:min-h-0 tw:overflow-hidden tw:text-[color:var(--ink)] tw:bg-[color:var(--review-home-bg)] tw:font-[family-name:var(--font-sans)] tw:text-[length:12px] tw:font-normal tw:leading-[16px]",
  scroll:
    "tw:flex-[1_1_auto] tw:min-h-0 tw:pt-[36px] tw:[@container_review-canvas_(max-width:_660px)]:pt-[32px] tw:px-[clamp(36px,_calc(12.5cqw_-_60px),_120px)] tw:[@container_review-canvas_(660px_<_width_<=_980px)]:px-[36px] tw:[@container_review-canvas_(max-width:_660px)]:px-[24px] tw:pb-[max(56px,_var(--review-bottom-scroll-padding,_0px))] tw:overflow-auto tw:[scrollbar-gutter:stable]",
  content: "tw:flex tw:flex-col tw:w-[min(1200px,_100%)] tw:m-[0_auto]",
  header:
    "tw:flex tw:items-start tw:[@container_review-canvas_(max-width:_660px)]:items-center tw:justify-between tw:gap-[32px]",
  heading:
    "tw:m-0 tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:32px] tw:font-semibold tw:leading-[42px] tw:tracking-[-0.015em]",
};
