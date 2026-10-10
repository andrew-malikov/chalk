import { cn } from "@canvas/lib/utils";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "tw:peer tw:size-4 tw:shrink-0 tw:rounded-xs tw:border tw:border-input tw:shadow-xs tw:outline-none tw:transition-shadow tw:focus-visible:border-ring tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50 tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:data-[state=checked]:border-primary tw:data-[state=checked]:bg-primary tw:data-[state=checked]:text-primary-foreground tw:aria-invalid:border-destructive tw:motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="tw:grid tw:place-content-center tw:text-current"
      >
        {props.checked === "indeterminate" ? (
          <MinusIcon className="tw:size-3.5" aria-hidden="true" />
        ) : (
          <CheckIcon className="tw:size-3.5" aria-hidden="true" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
