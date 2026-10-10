import { Kbd as KbdPrimitive } from "@canvas/components/ui/kbd";
import { type StyleArg, withClass } from "@canvas/styles/stylex-props";
import type { ComponentProps } from "react";

type KbdProps = Omit<ComponentProps<"kbd">, "className" | "style"> & {
  xstyle?: StyleArg;
};

/** One key of a hotkey hint on the canvas. */
export function Kbd({ xstyle, ...props }: KbdProps) {
  return (
    <KbdPrimitive
      {...props}
      {...withClass(
        "tw:h-[17px] tw:min-w-4 tw:border tw:border-input tw:bg-background tw:text-[10px] tw:font-normal tw:leading-none tw:text-foreground",
        xstyle,
      )}
    />
  );
}
