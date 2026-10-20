import {
  AuthoringCursorContext,
  LensCursorContext,
  lensRowElement,
} from "@canvas/drawing/courier";
import { CourierFigure } from "@canvas/drawing/courier-figure";
import { cursorElement } from "@canvas/lib/cursor-element";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { cn } from "@canvas/lib/utils";
import { useContext, useState } from "react";

import { AuthoringActivityContext } from "./authoring-activity-context";
import { scopeLive } from "./authoring-cursor";
import { DisplayedReviewVersionContext } from "./displayed-review-version-context";
import { useReviewRoots } from "./review-root-context";

/**
 * The top-bar badge: the mini courier and what the agent is doing. While an
 * agent works, clicking it opens the Review surface; when the courier is on
 * the board, it also takes the reader to him, and he jumps so the eye finds
 * him. When only lenses are being written, or only the lenses' courier is
 * out, it opens the Diffs page and finds the courier in the lens list.
 */
export function AuthoringActivityBadge({
  onLocate,
}: {
  /** Show the surface (before scrolling to its courier, if any). */
  onLocate?(view: "review" | "diff"): void;
}) {
  const activity = useContext(AuthoringActivityContext);
  const documentCursor = useContext(AuthoringCursorContext);
  const lensCursor = useContext(LensCursorContext);
  const roots = useReviewRoots();

  const working = activity && activity !== "unknown";

  const toLenses =
    (scopeLive(activity, "lenses") && !scopeLive(activity, "document")) ||
    (!documentCursor && !!lensCursor);

  const cursor = toLenses ? lensCursor : documentCursor;

  const focuses = working ? (activity.focuses ?? []) : [];

  const description = [
    ...new Set(focuses.map((focus) => focus.description)),
  ].join(" · ");

  const tooltip = useTooltip<HTMLElement>(
    working
      ? `${description || "An agent has reported ongoing authoring work. This signal expires if updates stop."}${cursor ? " · Click to go to the courier." : ""}`
      : "Activity updates stopped. This does not mean the agent finished.",
  );

  const locate = () => {
    onLocate?.(toLenses ? "diff" : "review");

    // The surface may only be showing now; open navigation before measuring.
    requestAnimationFrame(() => {
      if (toLenses) {
        const trigger = roots?.appRef.current?.querySelector<HTMLButtonElement>(
          "[data-diff-navigation]",
        );

        if (trigger?.getAttribute("aria-expanded") === "false") trigger.click();
        roots?.appRef.current
          ?.querySelector<HTMLButtonElement>('[role="radio"][value="lenses"]')
          ?.click();
      }

      if (!cursor) return;
      requestAnimationFrame(() => {
        const container = toLenses
          ? roots?.appRef.current?.querySelector<HTMLElement>(".diff-lenses")
          : roots?.articleRef.current;

        if (!container) return;

        const target = (toLenses ? lensRowElement : cursorElement)(
          container,
          cursor,
        );

        if (!target) return;
        target.scrollIntoView?.({ block: "center", behavior: "smooth" });
        requestAnimationFrame(() =>
          container
            .querySelector<HTMLButtonElement>(
              `.courier[data-scope="${toLenses ? "lenses" : "document"}"] .courier-figure`,
            )
            ?.click(),
        );
      });
    });
  };

  if (!activity || (working && !activity.workingCount)) return null;

  const text = working
    ? description ||
      (activity.workingCount > 1
        ? `${activity.workingCount} agents working…`
        : "Agent working…")
    : "Activity unknown";

  // The class is a marker for tests.
  const badge = "host-authoring-activity";

  if (!working)
    return (
      <span
        className={cn(badge, styles.badge)}
        role="status"
        aria-live="polite"
        ref={tooltip}
      >
        <CourierFigure className={styles.courier} />
        <span className={styles.text}>{text}</span>
      </span>
    );

  return (
    <button
      type="button"
      className={cn(badge, styles.badge, styles.badgeActive)}
      data-active
      data-locatable
      aria-label={cursor ? `${text}. Go to the courier.` : undefined}
      ref={tooltip}
      onClick={locate}
    >
      <CourierFigure
        className={[styles.courier, styles.courierActive]}
        marching
      />
      <span className={styles.text} role="status" aria-live="polite">
        {text}
      </span>
    </button>
  );
}

/**
 * The word "Chalk" in the top bar's surface tabs. While an agent is writing,
 * marker ink sweeps through the word. The document is ready once it has
 * content and no authoring session is live, so ending (or losing) the lease is
 * what finishes it. When it becomes ready while the reader is on another
 * surface, an unread dot sits just past the word until they visit the tab, and
 * it comes back only when a later version arrives while they are elsewhere
 * again. A document that is already ready when this mounts counts as read.
 * Neither state changes the tab's layout box.
 */
export function ReviewSurfaceLabel({
  hasContent,
  active,
  label = "Chalk",
}: {
  hasContent: boolean;
  active: boolean;
  /** The tab's word; the scratchpad names itself. */
  label?: string;
}) {
  const activity = useContext(AuthoringActivityContext);
  const version = useContext(DisplayedReviewVersionContext) ?? null;

  // Any live lease, document or lenses, means the review is not ready yet.
  const live =
    activity !== undefined &&
    activity !== "unknown" &&
    activity.workingCount > 0;

  const ready = hasContent && !live;

  const [readVersion, setReadVersion] = useState<number | null>(() =>
    active || ready ? version : null,
  );

  if (active && readVersion !== version) setReadVersion(version);
  const unread = !active && ready && readVersion !== version;

  return (
    <span
      className={cn(
        styles.word,
        live && styles.wordWorking,
        live && active && styles.wordWorkingActive,
      )}
      data-working={live || undefined}
    >
      {label}
      {unread && <span className={styles.unread} aria-hidden="true" />}
    </span>
  );
}

const styles = {
  badge:
    "tw:inline-flex tw:flex-[0_1_auto] tw:min-w-0 tw:max-w-[420px] tw:items-center tw:gap-[7px] tw:h-[var(--chrome-control-height)] tw:mx-[4px] tw:p-[0_10px_0_6px] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:rounded-[999px] tw:bg-[color:var(--transparent)] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-medium tw:leading-[normal] tw:whitespace-nowrap",
  // While an agent works the badge is a button that locates the courier.
  badgeActive:
    "tw:cursor-pointer tw:bg-[color:var(--marker-tint)] tw:[&:hover]:bg-[color:var(--marker-glow)] tw:text-[color:var(--accent)] tw:font-semibold tw:[&:focus-visible]:[outline:1px_solid_var(--accent)] tw:[&:focus-visible]:outline-offset-[1px]",
  // A long update ends in an ellipsis inside the pill; the tooltip has it all.
  text: "tw:min-w-0 tw:overflow-hidden tw:text-ellipsis",
  courier:
    "tw:shrink-0 tw:w-[16px] tw:h-[20px] tw:overflow-visible tw:text-[color:var(--ink-faint)] tw:[transform:translateY(2px)_rotate(-8deg)]",
  // Arriving: the mini courier drops in when a lease begins.
  courierActive:
    "tw:text-[color:var(--accent)] tw:[transform:none] tw:[animation-name:authoring-activity-courier-arrive] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-name:none] tw:[animation-duration:380ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-duration:0s] tw:[animation-timing-function:cubic-bezier(0.2,_0.7,_0.2,_1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-timing-function:ease] tw:[animation-fill-mode:both] tw:[@media_(prefers-reduced-motion:_reduce)]:[animation-fill-mode:none]",
  // Neither the ink nor the unread dot touches the tab's layout: the dot is
  // out of flow and only color moves.
  word: "tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:relative",
  // Marker ink sweeps through the word while the agent writes.
  wordWorking:
    "tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:[background-image:linear-gradient(100deg,_var(--ink-muted)_0_40%,_var(--accent)_50%,_var(--ink-muted)_60%_100%)] tw:[@media_(prefers-reduced-motion:_reduce)]:[&:is(.canvas-topbar-tabs:is(*)_*)]:[background-image:none] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:[background-size:240%_100%] tw:[@media_(prefers-reduced-motion:_reduce)]:[&:is(.canvas-topbar-tabs:is(*)_*)]:[background-size:auto] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:[background-clip:text] tw:[@media_(prefers-reduced-motion:_reduce)]:[&:is(.canvas-topbar-tabs:is(*)_*)]:[background-clip:border-box] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:text-[color:var(--transparent)] tw:[@media_(prefers-reduced-motion:_reduce)]:[&:is(.canvas-topbar-tabs:is(*)_*)]:text-[color:var(--ink-muted)] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:[animation-name:authoring-activity-shimmer] tw:[@media_(prefers-reduced-motion:_reduce)]:[&:is(.canvas-topbar-tabs:is(*)_*)]:[animation-name:none] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:[animation-duration:1.6s] tw:[@media_(prefers-reduced-motion:_reduce)]:[&:is(.canvas-topbar-tabs:is(*)_*)]:[animation-duration:0s] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:[animation-timing-function:linear] tw:[@media_(prefers-reduced-motion:_reduce)]:[&:is(.canvas-topbar-tabs:is(*)_*)]:[animation-timing-function:ease] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:[animation-iteration-count:infinite] tw:[@media_(prefers-reduced-motion:_reduce)]:[&:is(.canvas-topbar-tabs:is(*)_*)]:[animation-iteration-count:1]",
  // The chosen tab inks darker, reduced motion included.
  wordWorkingActive:
    "tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:[background-image:linear-gradient(100deg,_var(--ink)_0_40%,_var(--accent)_50%,_var(--ink)_60%_100%)]",
  unread:
    "tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:absolute tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:top-[1px] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:right-[-7px] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:w-[4px] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:h-[4px] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:rounded-[50%] tw:[&:is(.canvas-topbar-tabs:is(*)_*)]:bg-[color:var(--accent)]",
};
