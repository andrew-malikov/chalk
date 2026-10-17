import { Input } from "@canvas/components/ui/input";
import { cn } from "@canvas/lib/utils";
import type { ClassValue } from "clsx";
import type { ComponentProps } from "react";

type TextFieldProps = Omit<ComponentProps<"input">, "className" | "style"> & {
  className?: ClassValue;
};

export function TextField({ className, ...props }: TextFieldProps) {
  return (
    <Input
      {...props}
      className={cn(
        "tw:h-[26px] tw:rounded-sm tw:bg-[var(--control-bg)] tw:px-2 tw:py-0 tw:font-[family-name:var(--chrome-font)] tw:text-xs",
        className,
      )}
    />
  );
}

// Exported for fields that are not a bare input: a textarea, a select, or a
// shell around an input and its buttons.
export const fieldStyles = {
  box: "tw:box-border tw:min-w-0 tw:h-[26px] tw:p-[0_8px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:[&:focus]:border-[color:var(--accent)] tw:rounded-[4px] tw:bg-[color:var(--control-bg)] tw:text-[color:var(--ink)] tw:font-[family-name:var(--chrome-font)] tw:text-[length:12px] tw:[outline:none] tw:[&:disabled]:opacity-[0.5]",
  // The input inside draws no box of its own.
  shell:
    "tw:border-[color:var(--rule)] tw:[&:focus-within]:border-[color:var(--accent)]",
  multiline: "tw:h-auto tw:p-[6px_8px] tw:leading-[1.5] tw:resize-y",
};
