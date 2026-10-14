import { cn } from "@canvas/lib/utils";
import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "tw:peer tw:inline-flex tw:h-[18px] tw:w-8 tw:shrink-0 tw:items-center tw:rounded-full tw:border tw:border-transparent tw:shadow-xs tw:outline-none tw:transition-[color,box-shadow] tw:focus-visible:border-ring tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50 tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:data-[state=checked]:bg-primary tw:data-[state=unchecked]:bg-input tw:motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="tw:pointer-events-none tw:block tw:size-3.5 tw:rounded-full tw:bg-background tw:transition-transform tw:data-[state=checked]:translate-x-4 tw:data-[state=unchecked]:translate-x-0 tw:motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
