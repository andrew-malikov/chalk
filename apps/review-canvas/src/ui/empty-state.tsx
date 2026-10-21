import { documentStyles } from "@canvas/documents/document-styles";
import { cn } from "@canvas/lib/utils";
import type { ClassValue } from "clsx";
import type { ComponentProps, ReactElement, ReactNode } from "react";

type EmptyStateProps = Omit<
  ComponentProps<"div">,
  "className" | "style" | "title" | "role"
> & {
  // A document reads it as its own heading and prose; inline is a quiet note
  // in a pane; boxed stands in for a figure.
  variant?: "document" | "inline" | "boxed";
  title?: ReactNode;
  message: ReactNode;
  // Defaults to alert in a document, status elsewhere.
  role?: "alert" | "status";
  action?: ReactNode;
  className?: ClassValue;
};

export function EmptyState({
  variant = "inline",
  title,
  message,
  role = variant === "document" ? "alert" : "status",
  action,
  className,
  ...props
}: EmptyStateProps): ReactElement {
  if (variant === "document") {
    return (
      <div role={role} {...props} className={cn(className)}>
        {title ? <h2 className={documentStyles.h2}>{title}</h2> : null}
        <p className={documentStyles.note}>{message}</p>
        {action}
      </div>
    );
  }

  const boxed = variant === "boxed";
  const Title = boxed ? "h3" : "p";

  return (
    <div role={role} {...props} className={cn(styles[variant], className)}>
      {title ? (
        <Title className={cn(styles.title, boxed && styles.boxedTitle)}>
          {title}
        </Title>
      ) : null}
      <p className={cn(styles.message, boxed && styles.boxedMessage)}>
        {message}
      </p>
      {action}
    </div>
  );
}

const styles = {
  inline:
    "tw:flex tw:flex-col tw:gap-[4px] tw:py-[16px] tw:text-[color:var(--ink-muted)] tw:text-[length:13px] tw:leading-[1.55]",
  boxed:
    "tw:box-border tw:grid tw:place-content-center tw:justify-items-center tw:p-[32px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule-soft)] tw:rounded-[10px] tw:bg-[color:var(--tray)] tw:text-[color:var(--ink-muted)] tw:text-center",
  title: "tw:m-0 tw:text-[color:var(--ink)] tw:font-medium",
  message: "tw:m-0",
  boxedTitle: "tw:mb-[8px] tw:text-[length:15px] tw:leading-[1.3]",
  boxedMessage: "tw:max-w-[540px] tw:text-[length:13px] tw:leading-[1.55]",
};
