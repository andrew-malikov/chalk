import { Kbd as KbdPrimitive } from "@canvas/components/ui/kbd";
import { cn } from "@canvas/lib/utils";
import type { ClassValue } from "clsx";
import type { ComponentProps } from "react";

type KbdProps = Omit<ComponentProps<"kbd">, "className" | "style"> & {
  className?: ClassValue;
};

/** One key of a hotkey hint on the canvas. */
export function Kbd({ className, ...props }: KbdProps) {
  return (
    <KbdPrimitive
      {...props}
      className={cn(
        "tw:h-[17px] tw:min-w-4 tw:border tw:border-input tw:bg-background tw:text-[10px] tw:font-normal tw:leading-none tw:text-foreground",
        className,
      )}
    />
  );
}
