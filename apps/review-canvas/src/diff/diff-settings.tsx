import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canvas/components/ui/popover";
import { Switch } from "@canvas/components/ui/switch";
import { useReviewSession } from "@canvas/host/review-session";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { cn } from "@canvas/lib/utils";
import { Choice } from "@canvas/settings/settings-choice";
import { controlStyles } from "@canvas/styles/controls-styles";
import { shellStyles } from "@canvas/styles/shell-styles";
import { IconButton } from "@canvas/ui/button";
import { SlidersIcon } from "@canvas/ui/icons";
import type { ReviewDiffPreferences } from "@chalk/review-contracts";
import { BracesIcon, Columns2Icon, WrapTextIcon } from "lucide-react";
import {
  type ReactElement,
  type ReactNode,
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
  const tooltip = useTooltip("Diff settings");
  const [layout, setLayout] = useDiffPreference("layout");
  const [mode, setMode] = useDiffPreference("mode");
  const [wrap, setWrap] = useDiffPreference("wrap");

  return (
    <div className={cn(shellStyles.topbarItem, styles.settings)}>
      <Popover>
        <PopoverTrigger asChild>
          <IconButton aria-label="Diff settings" ref={tooltip}>
            <SlidersIcon className={controlStyles.chromeIcon} />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          aria-label="Diff settings"
          className="tw:w-[300px] tw:p-1.5"
        >
          <SettingRow icon={<Columns2Icon />} label="Layout">
            <Choice
              label="Diff layout"
              value={layout}
              labels={{ unified: "Unified", split: "Split" }}
              disabled={false}
              onChange={setLayout}
            />
          </SettingRow>
          <SettingRow
            icon={<BracesIcon />}
            label="Structural diff"
            detail="Group by function, skip formatting"
          >
            <Switch
              aria-label="Structural diff"
              checked={mode === "structural"}
              onCheckedChange={(on) => setMode(on ? "structural" : "text")}
            />
          </SettingRow>
          <SettingRow icon={<WrapTextIcon />} label="Wrap lines">
            <Switch
              aria-label="Wrap lines"
              checked={wrap}
              onCheckedChange={setWrap}
            />
          </SettingRow>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SettingRow({
  icon,
  label,
  detail,
  children,
}: {
  icon: ReactElement;
  label: string;
  detail?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="tw:flex tw:min-h-11 tw:items-center tw:gap-3 tw:rounded-md tw:px-2.5 tw:py-2 tw:text-[13px]">
      <span
        className="tw:text-muted-foreground tw:[&_svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="tw:grid tw:flex-1 tw:gap-0.5">
        <span>{label}</span>
        {detail && (
          <span className="tw:text-xs tw:text-muted-foreground">{detail}</span>
        )}
      </span>
      {children}
    </div>
  );
}

const styles = {
  settings: "tw:relative",
};
