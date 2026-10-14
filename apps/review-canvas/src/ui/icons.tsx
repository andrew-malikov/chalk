import { chevronMarker, segmentMarker } from "@canvas/styles/markers.stylex";
import { motion } from "@canvas/styles/scale.stylex";
import { tokens } from "@canvas/styles/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
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
export type IconProps = { xstyle?: stylex.StyleXStyles };

export function CloseIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <X
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function SlidersIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <SlidersHorizontal
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function StackIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Layers
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function BugIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Bug
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function ContentsIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <List
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function TutorialIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <BookOpen
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function PlusIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Plus
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function MinusIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Minus
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function RefreshIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <RefreshCw
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function SettingsSlidersIcon(): ReactElement {
  return (
    <SlidersHorizontal
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.settingsSliders)}
    />
  );
}

export function MapPinIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <MapPin
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

/**
 * The chalk marker stroke, drawn under a top bar surface; it is revealed
 * left to right with a clip. Its tab carries `segmentMarker`.
 */
export function MarkerUnderline({ active }: { active: boolean }): ReactElement {
  return (
    <svg
      {...stylex.props(styles.underline, active && styles.underlineActive)}
      viewBox="0 0 48 3"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        {...stylex.props(styles.underlineStroke)}
        d="M1 1.6 C 12 0.5, 30 2.5, 47 1.2"
      />
    </svg>
  );
}

/**
 * The one disclosure glyph. A 12px stroke chevron in a 16px slot that points
 * right when closed and rotates to point down when open.
 * Its button carries `chevronMarker`.
 */
export function DisclosureChevron({
  expanded,
  xstyle,
}: IconProps & {
  expanded: boolean;
}): ReactElement {
  return (
    <ChevronRight
      {...stylex.props(styles.chevron, expanded && styles.chevronOpen, xstyle)}
      aria-hidden="true"
      focusable="false"
      data-open={expanded || undefined}
    />
  );
}

export function DiscordIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <svg
      {...stylex.props(styles.icon, styles.discord, xstyle)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.317 4.37a19.792 19.792 0 0 0-4.885-1.515c-.211.375-.457.88-.626 1.282a18.416 18.416 0 0 0-5.42 0 12.64 12.64 0 0 0-.635-1.282A19.736 19.736 0 0 0 3.86 4.37C.768 8.946-.07 13.408.35 17.807a19.9 19.9 0 0 0 5.993 3.03c.483-.66.914-1.36 1.286-2.095a12.87 12.87 0 0 1-2.025-.987c.17-.124.337-.253.498-.385 3.905 1.826 8.148 1.826 12.006 0 .163.132.33.26.498.385a12.91 12.91 0 0 1-2.029.989c.372.734.802 1.434 1.285 2.094a19.84 19.84 0 0 0 5.997-3.03c.493-5.1-.843-9.521-3.542-13.438ZM8.02 15.117c-1.182 0-2.153-1.084-2.153-2.405s.95-2.407 2.153-2.407c1.203 0 2.174 1.084 2.153 2.407 0 1.32-.95 2.405-2.153 2.405Zm7.957 0c-1.182 0-2.153-1.084-2.153-2.405s.95-2.407 2.153-2.407c1.203 0 2.174 1.084 2.153 2.407 0 1.32-.95 2.405-2.153 2.405Z" />
    </svg>
  );
}

export function CopyIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Copy
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function CodeIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Code
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function CheckIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Check
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function ChatIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <MessageSquare
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function LockIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Lock
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function ArrowUpIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <ArrowUp
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function HistoryIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <History
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function ImageIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Image
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function TrashIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Trash2
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function SearchIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Search
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

export function PopOutIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <ExternalLink
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

/** A side panel, for docking a floating window back into it. */
export function DockIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <PanelRight
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, xstyle)}
    />
  );
}

/** Keep keyboard symbols independent of font glyph coverage. */
export function CommandKeyIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <Command
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, styles.key, xstyle)}
    />
  );
}

export function ShiftKeyIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <ArrowBigUp
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.icon, styles.key, xstyle)}
    />
  );
}

/** A select's closed-state chevron, the same glyph as `tokens.chevronDown`. */
export function ChevronDownIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <ChevronDown
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.chevronDown, xstyle)}
    />
  );
}

/** Where a floating window is dragged from. */
export function GripIcon({ xstyle }: IconProps = {}): ReactElement {
  return (
    <GripVertical
      aria-hidden="true"
      focusable="false"
      {...stylex.props(styles.grip, xstyle)}
    />
  );
}

const reducedMotion = "@media (prefers-reduced-motion: reduce)";

const styles = stylex.create({
  icon: {
    width: "15px",
    height: "15px",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "1.7px",
  },
  settingsSliders: {
    width: "16px",
    height: "16px",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "1.5px",
  },
  // As tall as a shortcut's letter.
  key: {
    width: "10px",
    height: "10px",
    strokeWidth: "2.2px",
  },
  chevronDown: {
    flex: "none",
    width: "12px",
    height: "12px",
    fill: "none",
    stroke: "currentcolor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  grip: {
    flex: "none",
    width: "10px",
    height: "14px",
    fill: "none",
  },
  discord: {
    fill: "currentColor",
    stroke: "none",
  },
  // The marker is drawn, not painted: a clip slides open, so the pen's
  // progress is the same whatever the tab's width (a dash offset would not
  // be under non-scaling-stroke). Hover draws a lighter stroke; leaving fades
  // the ink and only then closes the clip, so the pen never runs backwards.
  underline: {
    position: "absolute",
    bottom: "6px",
    left: 0,
    width: "100%",
    height: "3px",
    overflow: "visible",
    clipPath: {
      default: "inset(-2px 100% -2px 0)",
      [stylex.when.ancestor(":hover", segmentMarker)]: "inset(-2px 0 -2px 0)",
    },
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover", segmentMarker)]: 0.7,
    },
    pointerEvents: "none",
    transition: {
      default: `opacity ${motion.fast} ${motion.ease}, clip-path ${motion.instant} linear ${motion.fast}`,
      [stylex.when.ancestor(":hover", segmentMarker)]:
        `opacity ${motion.instant}, clip-path ${motion.slow} cubic-bezier(0.2, 0.7, 0.2, 1)`,
      [reducedMotion]: `opacity ${motion.fast} ${motion.ease}`,
    },
  },
  underlineActive: {
    clipPath: "inset(-2px 0 -2px 0)",
    opacity: {
      default: 1,
      [stylex.when.ancestor(":hover", segmentMarker)]: 0.7,
    },
    transition: {
      default: `opacity ${motion.instant}, clip-path ${motion.slow} cubic-bezier(0.2, 0.7, 0.2, 1)`,
      [reducedMotion]: `opacity ${motion.fast} ${motion.ease}`,
    },
  },
  underlineStroke: {
    fill: "none",
    stroke: tokens.accent,
    strokeWidth: "2",
    strokeLinecap: "round",
    vectorEffect: "non-scaling-stroke",
  },
  chevron: {
    flex: "none",
    width: "12px",
    height: "12px",
    margin: "2px",
    color: {
      default: tokens.inkFaint,
      [stylex.when.ancestor(":hover", chevronMarker)]: tokens.ink,
      [stylex.when.ancestor(":focus-visible", chevronMarker)]: tokens.ink,
    },
    fill: "none",
    stroke: "currentcolor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    transition: `transform ${motion.fast} ${motion.ease}, color ${motion.fast} ${motion.ease}`,
  },
  chevronOpen: {
    transform: "rotate(90deg)",
  },
});
