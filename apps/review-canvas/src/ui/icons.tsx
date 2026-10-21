import { cn } from "@canvas/lib/utils";
import type { ClassValue } from "clsx";
import {
  ArrowBigUp,
  ArrowUp,
  BookOpen,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Command,
  Copy,
  ExternalLink,
  GripVertical,
  History,
  Image,
  Layers,
  List,
  Lock,
  MapPin,
  MessageSquare,
  Minus,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { ReactElement } from "react";

/** Styles a parent adds to an icon for its context. */
export type IconProps = { className?: ClassValue };

export function CloseIcon({ className }: IconProps = {}): ReactElement {
  return (
    <X
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function StackIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Layers
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function BugIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Bug
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function ContentsIcon({ className }: IconProps = {}): ReactElement {
  return (
    <List
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function TutorialIcon({ className }: IconProps = {}): ReactElement {
  return (
    <BookOpen
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function PlusIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Plus
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function MinusIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Minus
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function RefreshIcon({ className }: IconProps = {}): ReactElement {
  return (
    <RefreshCw
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function SettingsSlidersIcon(): ReactElement {
  return (
    <SlidersHorizontal
      aria-hidden="true"
      focusable="false"
      className={styles.settingsSliders}
    />
  );
}

export function MapPinIcon({ className }: IconProps = {}): ReactElement {
  return (
    <MapPin
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

/**
 * The chalk marker stroke, drawn under a top bar surface; it is revealed
 * left to right with a clip. Its tab carries `segmentMarker`.
 */
export function MarkerUnderline({ active }: { active: boolean }): ReactElement {
  // The span keeps the svg from being a direct button child, and `size-full`
  // exempts it from the button's svg sizing.
  return (
    <span
      className={cn(styles.underline, active && styles.underlineActive)}
      aria-hidden="true"
    >
      <svg
        className={styles.underlineSvg}
        viewBox="0 0 48 3"
        preserveAspectRatio="none"
      >
        <path
          className={styles.underlineStroke}
          d="M1 1.6 C 12 0.5, 30 2.5, 47 1.2"
        />
      </svg>
    </span>
  );
}

/**
 * The one disclosure glyph. A 12px stroke chevron in a 16px slot that points
 * right when closed and rotates to point down when open.
 * Its button carries `chevronMarker`.
 */
export function DisclosureChevron({
  expanded,
  className,
}: IconProps & {
  expanded: boolean;
}): ReactElement {
  return (
    <ChevronRight
      className={cn(styles.chevron, expanded && styles.chevronOpen, className)}
      aria-hidden="true"
      focusable="false"
      data-open={expanded || undefined}
    />
  );
}

export function CopyIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Copy
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function CodeIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Code
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function CheckIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Check
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function ChatIcon({ className }: IconProps = {}): ReactElement {
  return (
    <MessageSquare
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function LockIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Lock
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function ArrowUpIcon({ className }: IconProps = {}): ReactElement {
  return (
    <ArrowUp
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function HistoryIcon({ className }: IconProps = {}): ReactElement {
  return (
    <History
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function ImageIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Image
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function TrashIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Trash2
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function SearchIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Search
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

export function PopOutIcon({ className }: IconProps = {}): ReactElement {
  return (
    <ExternalLink
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

/** A side panel, for docking a floating window back into it. */
export function DockIcon({ className }: IconProps = {}): ReactElement {
  return (
    <PanelRight
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, className)}
    />
  );
}

/** Keep keyboard symbols independent of font glyph coverage. */
export function CommandKeyIcon({ className }: IconProps = {}): ReactElement {
  return (
    <Command
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, styles.key, className)}
    />
  );
}

export function ShiftKeyIcon({ className }: IconProps = {}): ReactElement {
  return (
    <ArrowBigUp
      aria-hidden="true"
      focusable="false"
      className={cn(styles.icon, styles.key, className)}
    />
  );
}

/** A select's closed-state chevron, the same glyph as `tokens.chevronDown`. */
export function ChevronDownIcon({ className }: IconProps = {}): ReactElement {
  return (
    <ChevronDown
      aria-hidden="true"
      focusable="false"
      className={cn(styles.chevronDown, className)}
    />
  );
}

/** Where a floating window is dragged from. */
export function GripIcon({ className }: IconProps = {}): ReactElement {
  return (
    <GripVertical
      aria-hidden="true"
      focusable="false"
      className={cn(styles.grip, className)}
    />
  );
}

const styles = {
  icon: "tw:size-[15px] tw:fill-[none] tw:stroke-[currentColor] tw:[stroke-linecap:round] tw:[stroke-linejoin:round] tw:stroke-[1.7px]",
  settingsSliders:
    "tw:size-[16px] tw:fill-[none] tw:stroke-[currentColor] tw:[stroke-linecap:round] tw:[stroke-linejoin:round] tw:stroke-[1.5px]",
  // As tall as a shortcut's letter.
  key: "tw:size-[10px] tw:stroke-[2.2px]",
  chevronDown:
    "tw:flex-[none] tw:size-[12px] tw:fill-[none] tw:stroke-[currentcolor] tw:stroke-[2] tw:[stroke-linecap:round] tw:[stroke-linejoin:round]",
  grip: "tw:flex-[none] tw:w-[10px] tw:h-[14px] tw:fill-[none]",
  // The marker is drawn, not painted: a clip slides open, so the pen's
  // progress is the same whatever the tab's width (a dash offset would not
  // be under non-scaling-stroke). Hover draws a lighter stroke; leaving fades
  // the ink and only then closes the clip, so the pen never runs backwards.
  underline:
    "tw:absolute tw:bottom-[6px] tw:left-0 tw:w-full tw:h-[3px] tw:[clip-path:inset(-2px_100%_-2px_0)] tw:[&:is(.canvas-segment:hover_*)]:[clip-path:inset(-2px_0_-2px_0)] tw:opacity-0 tw:[&:is(.canvas-segment:hover_*)]:opacity-[0.7] tw:pointer-events-none tw:[transition:opacity_120ms_ease,_clip-path_0s_linear_120ms] tw:[&:is(.canvas-segment:hover_*)]:[transition:opacity_0s,_clip-path_300ms_cubic-bezier(0.2,_0.7,_0.2,_1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[transition:opacity_120ms_ease]",
  underlineActive:
    "tw:[clip-path:inset(-2px_0_-2px_0)] tw:opacity-[1] tw:[&:is(.canvas-segment:hover_*)]:opacity-[0.7] tw:[transition:opacity_0s,_clip-path_300ms_cubic-bezier(0.2,_0.7,_0.2,_1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[transition:opacity_120ms_ease]",
  underlineSvg: "tw:block tw:size-full tw:overflow-visible",
  underlineStroke:
    "tw:fill-[none] tw:stroke-[var(--accent)] tw:stroke-[2] tw:[stroke-linecap:round] tw:[vector-effect:non-scaling-stroke]",
  chevron:
    "tw:flex-[none] tw:size-[12px] tw:m-[2px] tw:text-[color:var(--ink-faint)] tw:[&:is(.canvas-chevron:hover_*)]:text-[color:var(--ink)] tw:[&:is(.canvas-chevron:focus-visible_*)]:text-[color:var(--ink)] tw:fill-[none] tw:stroke-[currentcolor] tw:stroke-[2] tw:[stroke-linecap:round] tw:[stroke-linejoin:round] tw:[transition:transform_120ms_ease,_color_120ms_ease]",
  chevronOpen: "tw:[transform:rotate(90deg)]",
};
