import * as stylex from "@stylexjs/stylex";

// The courier's CSS moves. His hop, jump and exit play in courier.tsx; the
// slide matches the hop's arc and bounce matches the jump's squash.
export const courierMotion = stylex.defineConsts({
  hop: "260ms",
  arrive: "380ms",
  march: "480ms",
  bounce: "520ms",
  doze: "5s",
  ponder: "2.4s",
});
