import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { cn } from "@canvas/lib/utils";
import { MinusIcon, PlusIcon } from "@canvas/ui/icons";
import { Kbd } from "@canvas/ui/kbd";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface SoftwareMapHotkeyItem {
  keys: readonly string[];
  label: string;
}

export interface SoftwareMapHotkeyGroup {
  id: string;
  label: string;
  items: readonly SoftwareMapHotkeyItem[];
}

interface SoftwareMapHotkeysTabProps {
  groups: readonly SoftwareMapHotkeyGroup[];
  activeGroupId: string;
  open: boolean;
  ariaLabel: string;
  onOpenChange: (open: boolean) => void;
}

export function SoftwareMapHotkeysTab({
  groups,
  activeGroupId,
  open,
  ariaLabel,
  onOpenChange,
}: SoftwareMapHotkeysTabProps): ReactElement {
  const rootRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const collapsedButtonRef = useRef<HTMLButtonElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  const measureWidth = useCallback(() => {
    const root = rootRef.current;
    const strip = stripRef.current;
    const toggle = toggleRef.current;
    const collapsedButton = collapsedButtonRef.current;

    if (!root || !strip || !toggle || !collapsedButton) {
      return;
    }

    const styles = getComputedStyle(root);

    const borderWidth =
      Number.parseFloat(styles.borderLeftWidth) +
      Number.parseFloat(styles.borderRightWidth);

    const openWidth = strip.scrollWidth + toggle.offsetWidth + borderWidth;
    const collapsedWidth = collapsedButton.scrollWidth + borderWidth;
    const nextWidth = Math.ceil(open ? openWidth : collapsedWidth);

    setMeasuredWidth((currentWidth) =>
      currentWidth === nextWidth ? currentWidth : nextWidth,
    );
  }, [open]);

  useLayoutEffect(() => {
    measureWidth();
  }, [measureWidth, groups, activeGroupId]);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => measureWidth());

    const observedElements = [
      stripRef.current,
      toggleRef.current,
      collapsedButtonRef.current,
    ];

    for (const element of observedElements) {
      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [measureWidth]);

  // SAFETY: React passes "--*" keys through to style.setProperty; CSSProperties
  // only lacks an index signature for custom properties.
  const style =
    measuredWidth === null
      ? undefined
      : ({
          "--software-map-hotkeys-width": `${measuredWidth}px`,
        } as CSSProperties);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Keep map shortcuts from receiving key events inside the hotkey panel.
    <aside
      ref={rootRef}
      className={cn(styles.tab, !open && styles.tabCollapsed)}
      aria-label={open ? ariaLabel : undefined}
      style={style}
      onKeyDown={stopSoftwareMapHotkeysKeyDown}
    >
      <div
        className={cn(styles.panel, !open && styles.panelCollapsed)}
        aria-hidden={!open}
      >
        <div ref={stripRef} className={styles.strip}>
          {groups.map((group) => (
            <div key={group.id} className={styles.group}>
              <span
                className={cn(
                  styles.groupLabel,
                  group.id === activeGroupId && styles.groupLabelActive,
                )}
              >
                {group.label}
              </span>
              {group.items.map((item) => (
                <span
                  key={`${group.id}:${item.label}`}
                  className={styles.item}
                  title={item.label}
                >
                  <span className={styles.keys}>
                    {item.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                  <span className={styles.itemLabel}>{item.label}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <ButtonPrimitive
          variant="ghost"
          size="xs"
          ref={toggleRef}
          type="button"
          className={cn(
            "tw:h-auto tw:whitespace-normal tw:font-normal",
            styles.button,
            styles.toggle,
          )}
          aria-label="Minimize software map hotkeys"
          aria-expanded="true"
          tabIndex={open ? 0 : -1}
          onClick={() => onOpenChange(false)}
        >
          <MinusIcon className={styles.icon} />
        </ButtonPrimitive>
      </div>
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        ref={collapsedButtonRef}
        type="button"
        className={cn(
          "tw:h-auto tw:whitespace-normal tw:font-normal",
          styles.button,
          styles.collapsedButton,
          !open && styles.collapsedButtonShown,
        )}
        aria-label="Show software map hotkeys"
        aria-expanded="false"
        tabIndex={open ? -1 : 0}
        onClick={() => onOpenChange(true)}
      >
        <span>Hotkeys</span>
        <PlusIcon className={styles.icon} />
      </ButtonPrimitive>
    </aside>
  );
}

// Keeps the map's own keys off the panel's buttons. Modifier chords such as
// Ctrl+Tab still reach the workbench keybindings on window.
function stopSoftwareMapHotkeysKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  event.stopPropagation();
}

const styles = {
  // A tab docked to the bottom edge, sized to its content.
  tab: "tw:absolute tw:bottom-0 tw:left-[50%] tw:z-[7] tw:flex tw:items-center tw:w-[var(--software-map-hotkeys-width,_max-content)] tw:[@media_(max-width:_760px)]:w-[calc(100%_-_24px)] tw:max-w-[calc(100%_-_24px)] tw:[@media_(max-width:_760px)]:max-w-none tw:h-[30px] tw:min-w-0 tw:overflow-hidden tw:border-[1px_1px_0] tw:[border-style:solid_solid_none] tw:border-[color:var(--rule)_var(--rule)_currentcolor] tw:rounded-[8px_8px_0_0] tw:bg-[color:var(--surface)] tw:text-[color:var(--ink)] tw:[box-shadow:0_-8px_24px_var(--shadow-color-strong)] tw:text-[length:11px] tw:leading-[1] tw:[transform:translateX(-50%)] tw:[transition:width_200ms_cubic-bezier(0.2,_0.8,_0.2,_1),_box-shadow_200ms_ease] tw:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] tw:[will-change:width]",
  tabCollapsed: "tw:[box-shadow:0_-4px_14px_var(--shadow-color-strong)]",
  panel:
    "tw:flex tw:items-center tw:w-full tw:h-full tw:min-w-0 tw:opacity-[1] tw:[transform:translateY(0)] tw:[transition:opacity_120ms_ease,_transform_200ms_cubic-bezier(0.2,_0.8,_0.2,_1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[transition:none]",
  panelCollapsed:
    "tw:opacity-0 tw:pointer-events-none tw:[transform:translateY(4px)]",
  strip:
    "tw:flex tw:flex-[1_1_auto] tw:gap-[12px] tw:items-center tw:min-w-0 tw:h-full tw:p-[0_8px_0_10px] tw:overflow-x-auto tw:[scrollbar-width:none] tw:[&::-webkit-scrollbar]:hidden",
  group:
    "tw:flex tw:flex-[0_0_auto] tw:gap-[6px] tw:items-center tw:min-w-0 tw:whitespace-nowrap",
  groupLabel:
    "tw:text-[color:var(--ink-faint)] tw:text-[length:10px] tw:font-semibold tw:tracking-[0]",
  groupLabelActive: "tw:text-[color:var(--accent)]",
  item: "tw:inline-flex tw:items-center tw:gap-[3px] tw:text-[color:var(--ink-muted)]",
  keys: "tw:inline-flex tw:items-center tw:gap-[2px]",
  itemLabel: "tw:text-[color:var(--ink-faint)]",
  button:
    "tw:inline-flex tw:items-center tw:h-full tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:var(--transparent)] tw:text-[color:var(--ink-faint)] tw:[&:hover]:text-[color:var(--ink)] tw:[&:focus-visible]:text-[color:var(--ink)] tw:cursor-pointer tw:[&:focus-visible]:[outline:1px_solid_var(--rule-soft)] tw:[&:focus-visible]:outline-offset-[-3px]",
  toggle:
    "tw:flex-[0_0_28px] tw:justify-center tw:w-[28px] tw:p-0 tw:[border-left-width:1px] tw:[border-left-style:solid] tw:[border-left-color:var(--rule-soft)]",
  collapsedButton:
    "tw:absolute tw:inset-[0_auto_0_0] tw:gap-[6px] tw:p-[0_10px] tw:text-[color:var(--ink-muted)] tw:[&:hover]:text-[color:var(--ink)] tw:[&:focus-visible]:text-[color:var(--ink)] tw:font-[family-name:inherit] tw:text-[length:inherit] tw:font-[number:inherit] tw:leading-[inherit] tw:[font-style:inherit] tw:opacity-0 tw:pointer-events-none tw:[transform:translateY(-3px)] tw:[transition:opacity_120ms_ease,_transform_200ms_cubic-bezier(0.2,_0.8,_0.2,_1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[transition:none]",
  collapsedButtonShown:
    "tw:opacity-[1] tw:pointer-events-auto tw:[transform:translateY(0)]",
  icon: "tw:size-[14px] tw:pointer-events-none",
};
