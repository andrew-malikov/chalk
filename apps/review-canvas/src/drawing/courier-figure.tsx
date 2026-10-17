import { cn } from "@canvas/lib/utils";
import type { ClassValue } from "clsx";

/** What the board courier is doing, which his figure draws. */
export interface CourierPose {
  idle: "none" | "march" | "sit";
  jumping: boolean;
}

/**
 * The courier: the one character on the board. A marker-blue outline with
 * two dot eyes and two feet, the same figure at every size. Strokes take
 * `currentColor`; the shell is filled with the board so lines behind him
 * do not show through.
 */
export function CourierFigure({
  className,
  pose,
  marching = false,
  thinking = false,
}: {
  className?: ClassValue;
  /** The board courier's pose; the badge's mini courier has none. */
  pose?: CourierPose;
  /** The badge's mini courier marches while an agent works. */
  marching?: boolean;
  /** Standing still, looking about while he works something out. */
  thinking?: boolean;
}) {
  const board = pose !== undefined;
  const march = pose?.idle === "march";
  const sit = pose?.idle === "sit";

  return (
    <svg
      className={cn(className)}
      viewBox="0 0 28 34"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className={cn(styles.whoosh, march && styles.whooshMarching)}
        d="M-6 27h6M-9 31h5"
      />
      <path
        className={cn(
          styles.line,
          board && styles.still,
          (march || marching) && styles.marchLeft,
          sit && styles.sitLeft,
        )}
        d="M9 24v7h-4"
      />
      <path
        className={cn(
          styles.line,
          board && styles.still,
          (march || marching) && styles.marchRight,
          sit && styles.sitRight,
        )}
        d="M19 24v7h4"
      />
      <rect
        className={styles.shell}
        x="4"
        y="8"
        width="20"
        height="16"
        rx="6"
      />
      <g
        className={cn(
          board && styles.still,
          sit && styles.dozing,
          thinking && styles.pondering,
        )}
      >
        <circle className={styles.eye} cx="11" cy="15" r="1.3" />
        <circle className={styles.eye} cx="18" cy="15" r="1.3" />
        <path
          className={cn(
            styles.line,
            styles.lids,
            board && styles.still,
            pose?.jumping && styles.happy,
          )}
          d="M8.5 15.5q2.5-3 5 0M15.5 15.5q2.5-3 5 0"
        />
      </g>
    </svg>
  );
}

const styles = {
  shell:
    "tw:fill-[var(--surface)] tw:stroke-[currentColor] tw:stroke-[1.6] tw:[stroke-linejoin:round]",
  eye: "tw:fill-[currentColor]",
  // The legs and the eyelids.
  line: "tw:fill-[none] tw:stroke-[currentColor] tw:stroke-[1.6] tw:[stroke-linecap:round] tw:[stroke-linejoin:round]",
  lids: "tw:stroke-[1.4] tw:opacity-0",
  whoosh:
    "tw:stroke-[currentColor] tw:stroke-[1.2] tw:[stroke-linecap:round] tw:opacity-0",
  whooshMarching: "tw:opacity-[0.5]",
  // On the board, reduced motion keeps him still.
  still: "tw:[@media_(prefers-reduced-motion:_reduce)]:[transition:none]",
  // Idle: march in place, then sit.
  marchLeft:
    "tw:[animation-name:courier-figure-march-left] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:480ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:ease-in-out] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-iteration-count:infinite] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-iteration-count:1]",
  marchRight:
    "tw:[animation-name:courier-figure-march-right] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:480ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:ease-in-out] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-iteration-count:infinite] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-iteration-count:1]",
  // Sitting eases in, reduced motion included.
  sitLeft:
    "tw:[transform:rotate(-80deg)] tw:[transform-origin:9px_24px] tw:[transition:transform_300ms_ease]",
  sitRight:
    "tw:[transform:rotate(80deg)] tw:[transform-origin:19px_24px] tw:[transition:transform_300ms_ease]",
  dozing:
    "tw:[animation-name:courier-figure-doze] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:5s] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:steps(1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-iteration-count:infinite] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-iteration-count:1]",
  pondering:
    "tw:[animation-name:courier-figure-ponder] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:2.4s] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:steps(1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-iteration-count:infinite] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-iteration-count:1]",
  // Happy eyes on a jump.
  happy:
    "tw:[animation-name:courier-figure-happy] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:520ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:steps(1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-fill-mode:forwards] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-fill-mode:none]",
};
