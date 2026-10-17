import { Button } from "@canvas/components/ui/button";
import { useCanvasMenu } from "@canvas/host/canvas-ui";
import { cn } from "@canvas/lib/utils";
import type { ClassValue } from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

/** A single-choice menu; the caller renders the trigger's content. */
export function OptionMenu<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  triggerClassName,
  triggerProps,
  variant = "ghost",
  size = "xs",
  children,
}: {
  ariaLabel: string;
  value: T | undefined;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange(value: T): void;
  variant?: "ghost" | "outline";
  size?: "xs" | "sm";
  triggerClassName?: ClassValue;
  triggerProps?: { "aria-pressed"?: boolean };
  children: ReactNode;
}) {
  const menu = useCanvasMenu({
    items: options.map((option) => ({
      id: option.value,
      label: option.label,
      checked: option.value === value,
    })),
    onSelect: (id) => {
      const option = options.find((option) => option.value === id);

      if (option) onChange(option.value);
    },
  });

  return (
    <div className={styles.menu}>
      <Button
        variant={variant}
        size={size}
        className={cn(triggerClassName)}
        type="button"
        aria-label={ariaLabel}
        {...menu.triggerProps}
        {...triggerProps}
      >
        {children}
        {menu.open ? (
          <ChevronUp className={styles.chevron} aria-hidden="true" />
        ) : (
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

const styles = {
  menu: "tw:relative",
  chevron:
    "tw:size-[12px] tw:shrink-0 tw:fill-[none] tw:stroke-[currentColor] tw:stroke-[1.8] tw:[stroke-linecap:round] tw:[stroke-linejoin:round]",
};
