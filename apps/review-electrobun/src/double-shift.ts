type ShiftKey = Pick<
  KeyboardEvent,
  "key" | "repeat" | "metaKey" | "ctrlKey" | "altKey" | "timeStamp"
>;

/** Reports a bare Shift tapped twice in quick succession; any other key resets it. */
export function createDoubleShift(interval = 400) {
  let last = -Infinity;

  return (event: ShiftKey) => {
    if (event.repeat) return false;

    if (
      event.key !== "Shift" ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      last = -Infinity;

      return false;
    }

    const double = event.timeStamp - last < interval;
    last = double ? -Infinity : event.timeStamp;

    return double;
  };
}
