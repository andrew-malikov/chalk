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
