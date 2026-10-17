import { Button as ShadcnButton } from "@canvas/components/ui/button";
import { cn } from "@canvas/lib/utils";
import type { ClassValue } from "clsx";
import { LoaderCircleIcon } from "lucide-react";
import type { ComponentProps } from "react";

type NativeButtonProps = Omit<ComponentProps<"button">, "className" | "style">;

type ButtonProps = NativeButtonProps & {
  loading?: boolean;
  variant?: "ghost" | "secondary" | "primary" | "warning";
  size?: "default" | "large";
  className?: ClassValue;
};

type IconButtonProps = NativeButtonProps & {
  loading?: boolean;
  "aria-label": string;
  size?: "small" | "default" | "large";
  className?: ClassValue;
};

// Keep the canvas's compact sizes and layout overrides while sharing
// shadcn's variants, disabled states and keyboard focus with the shell.
export function Button({
  variant = "secondary",
  size = "default",
  className,
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ShadcnButton
      type={type}
      variant={
        variant === "secondary"
          ? "outline"
          : variant === "ghost"
            ? "ghost"
            : "default"
      }
      size="xs"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "tw:relative tw:font-[family-name:var(--chrome-font)] tw:gap-1.5 tw:px-2.5 tw:has-[>svg]:px-2.5 tw:[&_svg:not([class*='size-'])]:size-[var(--chrome-icon-size)]",
        size === "large" && "tw:h-7",
        variant === "ghost" && "tw:text-muted-foreground",
        variant === "warning" &&
          "tw:bg-[var(--change-modified)] tw:text-[var(--on-warning)] tw:hover:bg-[var(--change-modified)]/90",
        className,
      )}
    >
      {loading ? (
        <LoadingButtonContent>{children}</LoadingButtonContent>
      ) : (
        children
      )}
    </ShadcnButton>
  );
}

export function IconButton({
  size = "default",
  className,
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: IconButtonProps) {
  return (
    <ShadcnButton
      type={type}
      variant="ghost"
      size="icon-xs"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "tw:relative tw:text-muted-foreground tw:[&_svg:not([class*='size-'])]:size-[var(--chrome-icon-size)]",
        size === "small" && "tw:size-5",
        size === "large" && "tw:size-[30px]",
        className,
      )}
    >
      {loading ? (
        <LoadingButtonContent>{children}</LoadingButtonContent>
      ) : (
        children
      )}
    </ShadcnButton>
  );
}

function LoadingButtonContent({
  children,
}: Pick<NativeButtonProps, "children">) {
  return (
    <>
      <span className="tw:opacity-0 tw:inline-flex tw:items-center tw:gap-1.5">
        {children}
      </span>
      <span
        className="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center"
        aria-hidden="true"
      >
        <LoaderCircleIcon className="tw:animate-spin tw:motion-reduce:animate-none" />
      </span>
    </>
  );
}
