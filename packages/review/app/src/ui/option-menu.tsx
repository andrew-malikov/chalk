import { Button } from "@canvas/components/ui/button";
import { useCanvasMenu } from "@canvas/host/canvas-ui";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

/** A single-choice menu; the caller renders the trigger's content. */
export function OptionMenu<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  triggerStyle,
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
  triggerStyle?: stylex.StyleXStyles;
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
    <div {...stylex.props(styles.menu)}>
      <Button
        variant={variant}
        size={size}
        {...stylex.props(triggerStyle)}
        type="button"
        aria-label={ariaLabel}
        {...menu.triggerProps}
        {...triggerProps}
      >
        {children}
        {menu.open ? (
          <ChevronUp {...stylex.props(styles.chevron)} aria-hidden="true" />
        ) : (
          <ChevronDown {...stylex.props(styles.chevron)} aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

const styles = stylex.create({
  menu: {
    position: "relative",
  },
  chevron: {
    width: "12px",
    height: "12px",
    flexShrink: 0,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
});
