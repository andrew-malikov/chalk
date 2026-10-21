import { RadioGroup, RadioGroupItem } from "@canvas/components/ui/radio-group";
import { useReviewSession } from "@canvas/host/review-session";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { cn } from "@canvas/lib/utils";
import { shellStyles } from "@canvas/styles/shell-styles";
import type { ReviewDiffPreferences } from "@chalk/review-contracts";
import {
  ArrowRightToLineIcon,
  BracesIcon,
  Columns2Icon,
  Rows2Icon,
  TextAlignStartIcon,
  WrapTextIcon,
} from "lucide-react";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

export function useDiffPreference<K extends keyof ReviewDiffPreferences>(
  key: K,
): [ReviewDiffPreferences[K], (value: ReviewDiffPreferences[K]) => void] {
  const { bridge } = useReviewSession();

  const value = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const subscription = bridge.onDidChangeDiffPreference(key, onChange);

        return () => subscription.dispose();
      },
      [bridge, key],
    ),
    () => bridge.diffPreference(key),
  );

  // The desktop confirms a write by round-tripping the setting through its
  // change event. The choice shows at once and holds until that confirmation,
  // or drops back if the write fails.
  const [pending, setPending] = useState<ReviewDiffPreferences[K] | null>(null);

  const shown = pending ?? value;

  useEffect(() => {
    if (pending !== null && value === pending) setPending(null);
  }, [value, pending]);

  const choose = (next: ReviewDiffPreferences[K]) => {
    if (next === shown) return;
    setPending(next);
    bridge.setDiffPreference(key, next).catch(() => {
      setPending(null);
    });
  };

  return [shown, choose];
}

export function DiffSettingsControl(): ReactElement {
  const [layout, setLayout] = useDiffPreference("layout");
  const [mode, setMode] = useDiffPreference("mode");
  const [wrap, setWrap] = useDiffPreference("wrap");

  return (
    <>
      <SettingSwitch
        label="Diff layout"
        value={layout}
        options={[
          { value: "unified", label: "Unified", icon: <Rows2Icon /> },
          { value: "split", label: "Split", icon: <Columns2Icon /> },
        ]}
        onChange={setLayout}
      />
      <SettingSwitch
        label="Diff mode"
        value={mode}
        options={[
          { value: "text", label: "Text diff", icon: <TextAlignStartIcon /> },
          {
            value: "structural",
            label: "Structural diff",
            detail: "Group by function, skip formatting",
            icon: <BracesIcon />,
          },
        ]}
        onChange={setMode}
      />
      <SettingSwitch
        label="Line wrapping"
        value={wrap ? "wrap" : "nowrap"}
        options={[
          { value: "nowrap", label: "No wrap", icon: <ArrowRightToLineIcon /> },
          { value: "wrap", label: "Wrap lines", icon: <WrapTextIcon /> },
        ]}
        onChange={(next) => setWrap(next === "wrap")}
      />
    </>
  );
}

type SwitchOption<T extends string> = {
  value: T;
  label: string;
  detail?: string;
  icon: ReactElement;
};

// Both sides stay visible, so the setting reads as where it is and where a
// click takes it, rather than a lone icon that is either lit or not.
function SettingSwitch<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SwitchOption<T>[];
  onChange: (value: T) => void;
}): ReactElement {
  return (
    <RadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      className={cn(
        shellStyles.topbarItem,
        "tw:inline-flex tw:gap-0.5 tw:rounded-lg tw:bg-muted tw:p-0.5",
      )}
      onValueChange={(next) => {
        const option = options.find((option) => option.value === next);

        if (option) onChange(option.value);
      }}
    >
      {options.map((option) => (
        <SwitchItem key={option.value} option={option} />
      ))}
    </RadioGroup>
  );
}

function SwitchItem<T extends string>({
  option,
}: {
  option: SwitchOption<T>;
}): ReactElement {
  const tooltipRef = useTooltip(option.label, { detail: option.detail });

  return (
    <RadioGroupItem
      ref={tooltipRef}
      value={option.value}
      aria-label={option.label}
      className="tw:inline-flex tw:aspect-auto tw:size-6 tw:items-center tw:justify-center tw:rounded-md tw:border-0 tw:text-muted-foreground tw:shadow-none tw:hover:text-foreground tw:data-[state=checked]:bg-background tw:data-[state=checked]:text-foreground tw:data-[state=checked]:shadow-xs tw:[&_svg]:size-[var(--chrome-icon-size)]"
    >
      {option.icon}
    </RadioGroupItem>
  );
}
