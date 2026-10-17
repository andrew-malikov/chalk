import type { ReactElement, ReactNode } from "react";

export function StatusBanner({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}): ReactElement {
  return (
    <div className={styles.banner} role="status">
      <span>{children}</span>
      {action}
    </div>
  );
}

const styles = {
  banner:
    "tw:flex tw:items-center tw:justify-center tw:gap-[12px] tw:p-[6px_12px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule-soft)] tw:bg-[color:color-mix(in_srgb,_var(--accent)_12%,_var(--surface))] tw:text-[color:var(--ink)] tw:font-[family-name:var(--chrome-font)] tw:text-[length:12px]",
};
