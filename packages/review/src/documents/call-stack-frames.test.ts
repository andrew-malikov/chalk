import { describe, expect, it } from "vitest";

import { frameIdentity } from "./call-stack-frames";

describe("frame identity", () => {
  it("prefers the explicit key and falls back to the source range", () => {
    const source = {
      file: "src/a.ts",
      start: { side: "head", line: 3 },
      end: { side: "head", line: 4 },
    } as const;

    expect(frameIdentity({ id: "x", key: "moved", source })).toBe("moved");
    expect(frameIdentity({ id: "x", source })).toBe(frameIdentity({ source }));
    expect(frameIdentity({ source })).not.toBe(
      frameIdentity({ source: { ...source, end: { side: "head", line: 5 } } }),
    );
  });
});
