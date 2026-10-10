import { cn } from "@canvas/lib/utils";
import type { ComponentProps } from "react";

function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "tw:pointer-events-none tw:inline-flex tw:h-5 tw:min-w-5 tw:items-center tw:justify-center tw:gap-1 tw:rounded-sm tw:bg-muted tw:px-1 tw:font-mono tw:text-xs tw:font-medium tw:text-muted-foreground tw:select-none",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
