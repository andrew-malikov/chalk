import { expect, test } from "vitest";

import { createDoubleShift } from "./double-shift";

const key = (key: string, timeStamp: number, extra = {}) => ({
  key,
  timeStamp,
  repeat: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...extra,
});

test("two quick Shift taps open the palette once", () => {
  const press = createDoubleShift();
  expect(press(key("Shift", 0))).toBe(false);
  expect(press(key("Shift", 200))).toBe(true);
  expect(press(key("Shift", 300))).toBe(false);
});

test("slow taps, held Shift, and typing between taps do not open it", () => {
  const press = createDoubleShift();
  press(key("Shift", 0));
  expect(press(key("Shift", 500))).toBe(false);
  expect(press(key("Shift", 600, { repeat: true }))).toBe(false);
  press(key("A", 700));
  expect(press(key("Shift", 800))).toBe(false);
});
