import { courierMotion } from "@canvas/drawing/courier-motion.stylex";
import { cursorElement } from "@canvas/lib/cursor-element";
import { AuthoringActivityContext } from "@canvas/review/authoring-activity-context";
import {
  type AuthoringCursor,
  scopeFocus,
  scopeLive,
} from "@canvas/review/authoring-cursor";
import { useReviewRoots } from "@canvas/review/review-root-context";
import {
  courierMarker,
  diffWorkspaceMarker,
} from "@canvas/styles/markers.stylex";
import {
  fontSize,
  fontWeight,
  motion,
  radius,
} from "@canvas/styles/scale.stylex";
import { withClass } from "@canvas/styles/stylex-props";
import { tokens } from "@canvas/styles/tokens.stylex";
import type { LeaseScope } from "@review/node/review-api/activity";
import * as stylex from "@stylexjs/stylex";
import { type AnimationPlaybackControls, animate } from "motion";
import {
  type Context,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { CourierFigure } from "./courier-figure";

/** The cursor for the document on screen; undefined while viewing history. */
export const AuthoringCursorContext = createContext<
  AuthoringCursor | null | undefined
>(undefined);

/** The cursor for the lenses on the Diffs page; undefined while viewing
 * history. */
export const LensCursorContext = createContext<
  AuthoringCursor | null | undefined
>(undefined);

export const cursorContext = (
  scope: LeaseScope,
): Context<AuthoringCursor | null | undefined> =>
  scope === "lenses" ? LensCursorContext : AuthoringCursorContext;

/** The lens row a lens cursor names, when it is on screen. */
export function lensRowElement(
  container: HTMLElement,
  cursor: AuthoringCursor,
): Element | null {
  const quoted = `"${cursor.targetId.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  const row = container.querySelector(`[data-lens-id=${quoted}]`);

  return row?.getClientRects().length ? row : null;
}

const SIT_AFTER_MS = 3000;

/** Where he stands on an element: its top edge, centered on a small thing,
 * a little in from the left on a wide one. A container that scrolls (the
 * lens list) carries him with its content. */
function standingPoint(target: DOMRect, container: HTMLElement) {
  const box = container.getBoundingClientRect();

  return {
    x:
      target.left -
      box.left +
      container.scrollLeft +
      Math.min(target.width / 2, 96),
    y: target.top - box.top + container.scrollTop,
  };
}

const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

type Idle = "none" | "march" | "sit";

type Move = "hopping" | "jumping" | "leaving";

interface Parts {
  arc: HTMLElement;
  squash: HTMLElement;
  shadow: HTMLElement;
}

// The hop: the wrapper slides (CSS, courierMotion.hop), the arc lifts, the
// body squashes on landing. The jump, on click: higher, with a wobble and
// happy eyes. The lease ended: up and out.
const moves: Record<
  Move,
  (parts: Parts, height: number) => AnimationPlaybackControls[]
> = {
  hopping: ({ arc, squash, shadow }, height) => [
    animate(
      arc,
      { y: [0, -height, 0] },
      { duration: 0.26, times: [0, 0.45, 1], ease: "easeOut" },
    ),
    animate(
      squash,
      {
        scaleX: [1.1, 0.92, 0.92, 1.14, 1],
        scaleY: [0.9, 1.1, 1.06, 0.84, 1],
      },
      { duration: 0.34, times: [0, 0.3, 0.76, 0.84, 1], ease: "easeOut" },
    ),
    animate(
      shadow,
      { scale: [1, 0.6, 1], opacity: [0.18, 0.08, 0.18] },
      { duration: 0.26, times: [0, 0.45, 1], ease: "easeOut" },
    ),
  ],
  jumping: ({ arc, squash, shadow }) => [
    animate(
      arc,
      { y: [0, -58, 0] },
      { duration: 0.42, times: [0, 0.5, 1], ease: [0.3, 0, 0.2, 1] },
    ),
    animate(
      squash,
      {
        scaleX: [1.25, 0.82, 0.9, 0.9, 1.22, 1],
        scaleY: [0.7, 1.24, 1.1, 1.06, 0.76, 1],
        rotate: [0, -6, 6, 0, 0, 0],
      },
      {
        duration: 0.52,
        times: [0, 0.18, 0.5, 0.8, 0.88, 1],
        ease: "easeOut",
      },
    ),
    animate(
      shadow,
      { scale: [1, 0.45, 1], opacity: [0.18, 0.05, 0.18] },
      { duration: 0.42, times: [0, 0.5, 1], ease: [0.3, 0, 0.2, 1] },
    ),
  ],
  leaving: ({ arc }) => [
    animate(
      arc,
      { y: [0, -10, -260], opacity: [1, 0.75, 0] },
      { duration: 0.42, times: [0, 0.25, 1], ease: [0.4, 0, 1, 1] },
    ),
  ],
};

/**
 * Stands on whatever the cursor names, hops when it moves, marches in place
 * while the lease is live and nothing is arriving, sits down after a while,
 * and hops up and out when the lease ends. Click him and he jumps. He is
 * absolutely positioned inside his container and measured against it, so
 * scrolling costs nothing; layout changes re-measure him.
 *
 * The document's courier lives in the article and follows the document
 * lease; the lenses' courier lives in the Diffs page's lens list and follows
 * the lenses lease. Both can be out at once.
 */
export function Courier({
  scope = "document",
  container,
  find = cursorElement,
}: {
  scope?: LeaseScope;
  /** Where he stands, once mounted; the document article by default. */
  container?: HTMLElement | null;
  find?: (container: HTMLElement, cursor: AuthoringCursor) => Element | null;
}) {
  const roots = useReviewRoots();
  const activity = useContext(AuthoringActivityContext);
  const cursor = useContext(cursorContext(scope));
  const arcRef = useRef<HTMLSpanElement>(null);
  const squashRef = useRef<HTMLSpanElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);

  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );

  const [motion, setMotion] = useState<Move | null>(null);
  const moveId = useRef(0);

  /** Plays a move; resolves true unless a later move took over. */
  const perform = async (next: Move, height = 0) => {
    const id = ++moveId.current;
    setMotion(next);
    const arc = arcRef.current;
    const squash = squashRef.current;
    const shadow = shadowRef.current;

    if (arc && squash && shadow && !reducedMotion())
      await Promise.all(
        moves[next]({ arc, squash, shadow }, height).map(
          (part) => part.finished,
        ),
      );

    return id === moveId.current;
  };

  const [idle, setIdle] = useState<Idle>("none");
  const [gone, setGone] = useState(false);

  const live = scopeLive(activity, scope);

  const unknown = activity === "unknown";

  // Follow the cursor: resolve its element, measure, and keep measuring
  // while the document reflows around it. No cursor, no courier.
  useLayoutEffect(() => {
    const article =
      container === undefined ? roots?.articleRef.current : container;

    if (!article || !cursor || gone) {
      setPosition(null);
      arrival.current = null;

      return;
    }

    let frame = 0;

    const measure = () => {
      frame = 0;
      const element = find(article, cursor);

      if (!element) return;

      const next = standingPoint(element.getBoundingClientRect(), article);

      setPosition((current) => {
        if (
          current &&
          Math.abs(current.x - next.x) < 1 &&
          Math.abs(current.y - next.y) < 1
        )
          return current;

        return next;
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    const resize = new ResizeObserver(schedule);
    resize.observe(article);
    const mutation = new MutationObserver(schedule);
    mutation.observe(article, { childList: true, subtree: true });

    return () => {
      resize.disconnect();
      mutation.disconnect();

      if (frame) cancelAnimationFrame(frame);
    };
  }, [roots, container, cursor, gone, find]);

  // A new cursor is a hop; the same spot re-measured after a reflow is a
  // slide. The first placement is neither.
  const arrival = useRef<{ x: number; y: number } | null>(null);
  const hopped = useRef<number>(undefined);

  useEffect(() => {
    if (!position || !cursor) return;
    const from = arrival.current;
    arrival.current = position;

    if (!from) {
      hopped.current = cursor.seq;

      return;
    }

    if (hopped.current === cursor.seq) return;
    const distance = Math.hypot(position.x - from.x, position.y - from.y);

    // The cursor moved but the spot has not yet: the measurement follows.
    if (distance < 1) return;
    hopped.current = cursor.seq;

    if (reducedMotion()) return;
    setIdle("none");
    void perform("hopping", Math.min(72, 18 + distance * 0.28)).then((done) => {
      if (done) setMotion(null);
    });
  }, [position, cursor]);

  // With nothing arriving he marches, then sits.
  useEffect(() => {
    if (!live || motion === "hopping" || motion === "leaving" || gone) return;
    setIdle("march");
    const timer = setTimeout(() => setIdle("sit"), SIT_AFTER_MS);

    return () => clearTimeout(timer);
  }, [live, motion, cursor?.seq, gone]);

  // The lease ended: one last hop up and out, then nothing.
  useEffect(() => {
    if (live || activity === undefined || unknown || !position || gone) return;
    setIdle("none");
    let cancelled = false;
    void perform("leaving").then((done) => {
      if (cancelled || !done) return;
      setGone(true);
      setMotion(null);
      setPosition(null);
      arrival.current = null;
    });

    return () => {
      cancelled = true;
    };
  }, [live, unknown, activity === undefined, Boolean(position), gone]);

  // A lease that begins again brings him back.
  useEffect(() => {
    if (live && gone) setGone(false);
  }, [live, gone]);

  const jump = () => {
    if (reducedMotion() || motion === "leaving") return;
    void perform("jumping").then((done) => {
      if (done) setMotion(null);
    });
  };

  if (!position || gone || activity === undefined) return null;

  const description =
    activity !== "unknown"
      ? scopeFocus(activity, scope)?.description
      : undefined;

  // The classes are markers: the badge finds him by them, and tests read
  // his tag.
  // courier is a marker: code, tests and the lens list's :has(> .courier) find it.
  return (
    <div
      {...withClass("courier", styles.courier, unknown && styles.unknown)}
      data-scope={scope}
      data-state={unknown ? "unknown" : live ? "live" : "ended"}
      data-idle={idle}
      data-motion={motion ?? undefined}
      style={{ left: position.x, top: position.y }}
      aria-hidden={unknown || undefined}
    >
      <button
        type="button"
        {...withClass("courier-figure", courierMarker, styles.figure)}
        aria-label={
          description
            ? `The agent's courier: ${description}. Press to make him jump.`
            : "The agent's courier. Press to make him jump."
        }
        onClick={jump}
      >
        {description && (
          <span {...withClass("courier-tag", styles.tag)} aria-hidden="true">
            {description}
          </span>
        )}
        <span ref={arcRef} {...stylex.props(styles.arc)}>
          <span
            {...stylex.props(
              styles.body,
              idle === "sit" && styles.sitting,
              unknown && styles.slumped,
              idle === "march" && styles.bob,
            )}
          >
            <span ref={squashRef} {...stylex.props(styles.body)}>
              <CourierFigure
                xstyle={styles.figureSvg}
                pose={{ idle, jumping: motion === "jumping" }}
              />
            </span>
          </span>
        </span>
        <span ref={shadowRef} {...stylex.props(styles.shadow)} />
      </button>
    </div>
  );
}

const REDUCED = "@media (prefers-reduced-motion: reduce)";

const inDiffWorkspace = () =>
  stylex.when.ancestor(":is(*)", diffWorkspaceMarker);

const marchBob = stylex.keyframes({
  "0%, 100%": { transform: "translateY(0) rotate(-2deg)" },
  "50%": { transform: "translateY(-1.5px) rotate(2deg)" },
});

// He stands on the top edge of whatever the cursor names and slides when it
// reflows. Reduced motion keeps him and drops the hops.
const styles = stylex.create({
  courier: {
    position: "absolute",
    zIndex: 4,
    width: "32px",
    height: "39px",
    margin: "-39px 0 0 -16px",
    color: tokens.accent,
    pointerEvents: "none",
    transition: {
      default: `left ${courierMotion.hop} linear, top ${courierMotion.hop} linear`,
      [REDUCED]: "none",
    },
  },
  // Unknown: grey and slumped, no motion.
  unknown: {
    color: tokens.inkFaint,
  },
  figure: {
    position: "relative",
    display: "block",
    width: "100%",
    height: "100%",
    padding: 0,
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    borderRadius: { default: null, ":focus-visible": radius.surface },
    backgroundColor: "transparent",
    backgroundImage: "none",
    color: "inherit",
    cursor: "pointer",
    pointerEvents: "auto",
    // In the lens list the diff workspace's button focus ring wins.
    outline: {
      default: null,
      ":focus-visible": {
        default: `2px solid ${tokens.accent}`,
        [inDiffWorkspace()]: `1px solid ${tokens.accent}`,
      },
    },
    outlineOffset: {
      default: null,
      ":focus-visible": { default: "4px", [inDiffWorkspace()]: "-2px" },
    },
  },
  figureSvg: {
    display: "block",
    width: "100%",
    height: "100%",
    overflow: "visible",
  },
  tag: {
    position: "absolute",
    top: "-20px",
    left: "50%",
    padding: "2px 7px",
    borderRadius: radius.pill,
    backgroundColor: tokens.ink,
    color: tokens.surface,
    font: `${fontWeight.medium} ${fontSize.micro} ${tokens.fontSans}`,
    whiteSpace: "nowrap",
    transform: "translateX(-50%)",
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover", courierMarker)]: 1,
      [stylex.when.ancestor(":focus-visible", courierMarker)]: 1,
      [REDUCED]: 1,
    },
    transition: `opacity ${motion.fast} ${motion.ease}`,
    pointerEvents: "none",
  },
  arc: {
    display: "block",
    width: "100%",
    height: "100%",
    transition: { default: null, [REDUCED]: "none" },
  },
  body: {
    display: "block",
    width: "100%",
    height: "100%",
    transformOrigin: "50% 100%",
    transition: { default: null, [REDUCED]: "none" },
  },
  // Sitting eases in, reduced motion included.
  sitting: {
    transform: "translateY(7px)",
    transition: `transform ${motion.slow} ${motion.ease}`,
  },
  slumped: {
    transform: "translateY(2px) rotate(-8deg)",
  },
  bob: {
    animationName: { default: marchBob, [REDUCED]: "none" },
    animationDuration: {
      default: courierMotion.march,
      [REDUCED]: motion.instant,
    },
    animationTimingFunction: { default: "ease-in-out", [REDUCED]: "ease" },
    animationIterationCount: { default: "infinite", [REDUCED]: 1 },
  },
  shadow: {
    position: "absolute",
    bottom: "-3px",
    left: "50%",
    width: "18px",
    height: "4px",
    marginLeft: "-9px",
    borderRadius: radius.round,
    backgroundColor: tokens.ink,
    opacity: 0.18,
    transition: { default: null, [REDUCED]: "none" },
  },
});
