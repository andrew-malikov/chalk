import { motion } from "@canvas/styles/scale.stylex";
import { tokens } from "@canvas/styles/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

const reducedMotion = "@media (prefers-reduced-motion: reduce)";

const sweep = stylex.keyframes({
  from: { backgroundPosition: "100% 0" },
  to: { backgroundPosition: "-100% 0" },
});

export const loadingStyles = stylex.create({
  text: {
    backgroundImage: {
      default: `linear-gradient(90deg, ${tokens.inkMuted} 40%, ${tokens.ink} 50%, ${tokens.inkMuted} 60%)`,
      [reducedMotion]: "none",
    },
    backgroundSize: "250% 100%",
    backgroundClip: { default: "text", [reducedMotion]: "border-box" },
    color: { default: tokens.transparent, [reducedMotion]: tokens.inkMuted },
    animationName: { default: sweep, [reducedMotion]: "none" },
    animationDuration: motion.pulse,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
});
