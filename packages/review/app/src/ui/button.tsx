import { Button as ShadcnButton } from "@canvas/components/ui/button";
import { type StyleArg, withClass } from "@canvas/stylex-props";
import type { ComponentProps } from "react";

type NativeButtonProps = Omit<ComponentProps<"button">, "className" | "style">;

type ButtonProps = NativeButtonProps & {
  variant?: "ghost" | "secondary" | "primary" | "warning";
  size?: "default" | "large";
  className?: string;
  xstyle?: StyleArg;
};

type IconButtonProps = NativeButtonProps & {
  "aria-label": string;
  size?: "small" | "default" | "large";
  className?: string;
  xstyle?: StyleArg;
};

// Keep the canvas's compact sizes and StyleX layout overrides while sharing
// shadcn's variants, disabled states and keyboard focus with the shell.
export function Button({
  variant = "secondary",
  size = "default",
  className,
  xstyle,
  type = "button",
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
      {...withClass(
        [
          "tw:font-[family-name:var(--chrome-font)] tw:gap-1.5 tw:px-2.5 tw:has-[>svg]:px-2.5 tw:[&_svg:not([class*='size-'])]:size-[var(--chrome-icon-size)]",
          size === "large" && "tw:h-7",
          variant === "ghost" && "tw:text-muted-foreground",
          variant === "warning" &&
            "tw:bg-[var(--change-modified)] tw:text-[var(--on-warning)] tw:hover:bg-[var(--change-modified)]/90",
          className,
        ]
          .filter(Boolean)
          .join(" "),
        xstyle,
      )}
    />
  );
}

export function IconButton({
  size = "default",
  className,
  xstyle,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <ShadcnButton
      type={type}
      variant="ghost"
      size="icon-xs"
      {...props}
      {...withClass(
        [
          "tw:text-muted-foreground tw:[&_svg:not([class*='size-'])]:size-[var(--chrome-icon-size)]",
          size === "small" && "tw:size-5",
          size === "large" && "tw:size-[30px]",
          className,
        ]
          .filter(Boolean)
          .join(" "),
        xstyle,
      )}
    />
  );
}
