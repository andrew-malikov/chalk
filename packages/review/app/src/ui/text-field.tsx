import { Input } from "@canvas/components/ui/input";
import { fontSize, radius } from "@canvas/styles/scale.stylex";
import { type StyleArg, withClass } from "@canvas/styles/stylex-props";
import { tokens } from "@canvas/styles/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps } from "react";

type TextFieldProps = Omit<ComponentProps<"input">, "className" | "style"> & {
  className?: string;
  xstyle?: StyleArg;
};

export function TextField({ className, xstyle, ...props }: TextFieldProps) {
  return (
    <Input
      {...props}
      {...withClass(
        [
          "tw:h-[26px] tw:rounded-sm tw:bg-[var(--control-bg)] tw:px-2 tw:py-0 tw:font-[family-name:var(--chrome-font)] tw:text-xs",
          className,
        ]
          .filter(Boolean)
          .join(" "),
        xstyle,
      )}
    />
  );
}

// Exported for fields that are not a bare input: a textarea, a select, or a
// shell around an input and its buttons.
export const fieldStyles = stylex.create({
  box: {
    boxSizing: "border-box",
    minWidth: 0,
    height: "26px",
    padding: "0 8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: { default: tokens.rule, ":focus": tokens.accent },
    borderRadius: radius.small,
    backgroundColor: tokens.controlBg,
    color: tokens.ink,
    fontFamily: tokens.chromeFont,
    fontSize: fontSize.body,
    outline: "none",
    opacity: { default: null, ":disabled": 0.5 },
  },
  // The input inside draws no box of its own.
  shell: {
    borderColor: { default: tokens.rule, ":focus-within": tokens.accent },
  },
  multiline: {
    height: "auto",
    padding: "6px 8px",
    lineHeight: 1.5,
    resize: "vertical",
  },
});
