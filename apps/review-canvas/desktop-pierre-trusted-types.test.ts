import { expect, it } from "vitest";

import { hardenPierreForTrustedTypes } from "./desktop-trusted-types";

it("passes generated Pierre HTML through the policy before assigning or inserting it", () => {
  const writes: string[] = [];
  const trusted = (value: string) => ({ value });
  const element = {
    set innerHTML(value: unknown) {
      if (typeof value !== "object" || value === null || !("value" in value))
        throw new TypeError("TrustedHTML required");
      writes.push(String(value.value));
    },
    insertAdjacentHTML(position: string, value: unknown) {
      if (typeof value !== "object" || value === null || !("value" in value))
        throw new TypeError("TrustedHTML required");
      writes.push(`${position}:${String(value.value)}`);
    },
  };
  const source = [
    'element.innerHTML = render("<escaped>");',
    'element.insertAdjacentHTML("beforeend", render("&escaped"));',
  ].join("\n");
  const transformed = hardenPierreForTrustedTypes(source);
  Function(
    "element",
    "render",
    "__reviewPierreHtml",
    transformed,
  )(element, (value: string) => value, trusted);
  expect(writes).toEqual(["<escaped>", "beforeend:&escaped"]);
});
