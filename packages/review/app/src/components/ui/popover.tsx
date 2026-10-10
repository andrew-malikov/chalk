import { cn } from "@canvas/lib/utils";
import { useReviewContainer } from "@canvas/review/review-root-context";
import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  container,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content> & {
  container?: HTMLElement | null;
}) {
  const reviewContainer = useReviewContainer();

  return (
    <PopoverPrimitive.Portal container={container ?? reviewContainer}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "tw:z-popover tw:w-72 tw:rounded-md tw:border tw:border-border tw:bg-popover tw:p-4 tw:text-popover-foreground tw:shadow-md tw:outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
