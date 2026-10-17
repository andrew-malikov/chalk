import { Badge } from "@canvas/components/ui/badge";
import { cn } from "@canvas/lib/utils";
import type { ClassValue } from "clsx";
import type { ComponentProps } from "react";

type ChipProps = Omit<ComponentProps<"span">, "className" | "style"> & {
  // A tag names a kind (DB, PK, a harness); a pill holds a short phrase.
  variant?: "tag" | "pill";
  // Large pills stand alone in a row; tags have one size.
  size?: "default" | "large";
  className?: ClassValue;
};

export function Chip({
  variant = "tag",
  size = "default",
  className,
  ...props
}: ChipProps) {
  return (
    <Badge
      variant="secondary"
      {...props}
      className={cn(
        "tw:h-[18px] tw:border-0 tw:py-0 tw:leading-none tw:text-muted-foreground",
        variant === "tag"
          ? "tw:rounded-sm tw:px-[5px] tw:text-[10px] tw:font-semibold tw:tracking-[0.06em] tw:uppercase"
          : "tw:gap-1.5 tw:px-2 tw:text-[11px] tw:font-normal",
        size === "large" && "tw:h-[22px]",
        className,
      )}
    />
  );
}

// Exported for chips that are buttons. Sites set their own tone after these.
export const chipStyles = {
  tag: "tw:inline-flex tw:flex-[0_0_auto] tw:items-center tw:h-[18px] tw:p-[0_5px] tw:rounded-[4px] tw:bg-[color:var(--well)] tw:text-[color:var(--ink-muted)] tw:text-[length:10px] tw:font-semibold tw:leading-[1] tw:tracking-[0.08em] tw:uppercase tw:whitespace-nowrap",
  pill: "tw:inline-flex tw:flex-[0_0_auto] tw:items-center tw:gap-[6px] tw:h-[18px] tw:p-[0_8px] tw:rounded-[999px] tw:bg-[color:var(--well)] tw:text-[color:var(--ink-muted)] tw:text-[length:11px] tw:leading-[1] tw:whitespace-nowrap",
  large: "tw:h-[22px]",
};
