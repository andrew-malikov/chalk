import { RadioGroup, RadioGroupItem } from "@canvas/components/ui/radio-group";

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
    <RadioGroup
      className="tw:inline-flex tw:gap-0.5 tw:rounded-md tw:border tw:border-border tw:bg-muted tw:p-0.5"
      aria-label={label}
      orientation="horizontal"
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const choice = choices.find((choice) => choice === next);

        if (choice !== undefined) onChange(choice);
      }}
    >
      {choices.map((choice) => (
        <RadioGroupItem
          key={choice}
          value={choice}
          className="tw:aspect-auto tw:h-6 tw:w-auto tw:rounded-sm tw:border-0 tw:px-2.5 tw:text-xs tw:font-normal tw:text-muted-foreground tw:shadow-none tw:hover:text-foreground tw:data-[state=checked]:bg-background tw:data-[state=checked]:text-foreground tw:data-[state=checked]:shadow-xs"
        >
          {labels[choice]}
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
}
