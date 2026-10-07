import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { controlStyles } from "@canvas/styles/controls-styles";
import * as stylex from "@stylexjs/stylex";

export function Choice<T extends string>({
  label,
  value,
  labels,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  labels: Record<T, string>;
  disabled: boolean;
  onChange: (choice: T) => void;
}) {
  // SAFETY: `labels` is declared as Record<T, string>, so its own keys are
  // exactly the T choices this control offers.
  const choices = Object.keys(labels) as T[];

  return (
    <div
      {...stylex.props(controlStyles.segmented)}
      role="radiogroup"
      aria-label={label}
    >
      {choices.map((choice) => (
        <ButtonPrimitive
          variant="ghost"
          size="xs"
          key={choice}
          type="button"
          role="radio"
          aria-checked={choice === value}
          disabled={disabled}
          {...stylex.props(
            controlStyles.segment,
            choice === value && controlStyles.segmentActive,
          )}
          onClick={() => onChange(choice)}
        >
          {labels[choice]}
        </ButtonPrimitive>
      ))}
    </div>
  );
}
