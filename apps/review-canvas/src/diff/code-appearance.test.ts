import { describe, expect, it } from "vitest";

import {
  codeFontFeatures,
  codeThemeMode,
  diffsAppearance,
} from "./code-appearance";

describe("code appearance", () => {
  it("pins the app mode only for single-variant themes", () => {
    expect(codeThemeMode("dracula")).toBe("dark");
    expect(codeThemeMode("snazzy-light")).toBe("light");
    expect(codeThemeMode("github")).toBeNull();
  });

  it("falls back to Pierre for an unknown theme", () => {
    expect(diffsAppearance("light", "gone").options.theme).toBe("pierre-light");
    expect(codeThemeMode("gone")).toBeNull();
  });

  it("reports the variant actually used", () => {
    expect(diffsAppearance("light", "dracula").options.themeType).toBe("dark");
  });

  it("turns ligatures off for any font", () => {
    expect(codeFontFeatures("Fira Code", false)).toContain('"liga" 0');
    expect(codeFontFeatures(null, false)).toContain('"liga" 0');
    expect(codeFontFeatures("Fira Code", true)).not.toContain("ss01");
    expect(codeFontFeatures(null, true)).toContain("ss10");
  });
});
