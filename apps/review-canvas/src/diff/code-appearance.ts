import type { ReviewCodeSize, ReviewTheme } from "@chalk/review-contracts";

export interface CodeTheme {
  id: string;
  label: string;
  dark?: string;
  light?: string;
}

/** Syntax themes offered in Settings. One with a single variant pins the app to that mode. */
export const CODE_THEMES: readonly CodeTheme[] = [
  { id: "pierre", label: "Pierre", dark: "pierre-dark", light: "pierre-light" },
  {
    id: "github",
    label: "GitHub",
    dark: "github-dark-default",
    light: "github-light-default",
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    dark: "catppuccin-mocha",
    light: "catppuccin-latte",
  },
  {
    id: "everforest",
    label: "Everforest",
    dark: "everforest-dark",
    light: "everforest-light",
  },
  {
    id: "gruvbox",
    label: "Gruvbox",
    dark: "gruvbox-dark-medium",
    light: "gruvbox-light-medium",
  },
  {
    id: "kanagawa",
    label: "Kanagawa",
    dark: "kanagawa-wave",
    light: "kanagawa-lotus",
  },
  {
    id: "night-owl",
    label: "Night Owl",
    dark: "night-owl",
    light: "night-owl-light",
  },
  { id: "one", label: "One", dark: "one-dark-pro", light: "one-light" },
  {
    id: "rose-pine",
    label: "Rosé Pine",
    dark: "rose-pine",
    light: "rose-pine-dawn",
  },
  {
    id: "solarized",
    label: "Solarized",
    dark: "solarized-dark",
    light: "solarized-light",
  },
  {
    id: "vitesse",
    label: "Vitesse",
    dark: "vitesse-dark",
    light: "vitesse-light",
  },
  { id: "dracula", label: "Dracula", dark: "dracula" },
  { id: "monokai", label: "Monokai", dark: "monokai" },
  { id: "nord", label: "Nord", dark: "nord" },
  { id: "tokyo-night", label: "Tokyo Night", dark: "tokyo-night" },
  { id: "vesper", label: "Vesper", dark: "vesper" },
  { id: "snazzy-light", label: "Snazzy Light", light: "snazzy-light" },
];

/** Unknown ids (an older preference, another host) fall back to Pierre. */
export function codeTheme(id: string | undefined): CodeTheme {
  return CODE_THEMES.find((theme) => theme.id === id) ?? CODE_THEMES[0]!;
}

/** The app mode a single-variant code theme requires, if any. */
export function codeThemeMode(id: string | undefined): ReviewTheme | null {
  const { dark, light } = codeTheme(id);

  return dark && light ? null : dark ? "dark" : "light";
}

const LINE_HEIGHT: Record<ReviewCodeSize, number> = { 12: 20, 13: 20, 14: 22 };

/**
 * Pierre options shared by every code surface. Tokens follow the code theme;
 * the background, text and change colors stay the app's, so any theme sits on
 * the same surface.
 */
export function diffsAppearance(
  mode: ReviewTheme,
  themeId: string | undefined,
  size: ReviewCodeSize = 12,
) {
  const family = codeTheme(themeId);
  const theme = (family[mode] ?? family.dark ?? family.light)!;
  const lineHeight = LINE_HEIGHT[size];

  return {
    lineHeight,
    options: {
      theme,
      themeType: theme === family.dark ? ("dark" as const) : ("light" as const),
      unsafeCSS: `:host{--diffs-font-family:var(--font-mono,monospace);--diffs-font-size:${size}px;--diffs-line-height:${lineHeight}px;--diffs-bg:var(--surface);--diffs-fg:var(--ink);--diffs-addition-color-override:light-dark(#18a46c,#07c480);--diffs-deletion-color-override:light-dark(#d52c36,#ff2e3f);--diffs-modified-color-override:#009fff}`,
    },
  };
}

/**
 * `font-feature-settings` for the code font. Monaspace keeps texture healing
 * in `calt` and its code ligatures in ss01–ss10; in other fonts stylistic sets
 * are unrelated glyph swaps, so only `liga`/`calt` toggle there.
 */
export function codeFontFeatures(
  font: string | null,
  ligatures: boolean,
): string {
  const monaspace = font === null || /^monas(pace|pice)/i.test(font);

  if (!monaspace) return ligatures ? '"calt", "liga"' : '"calt" 0, "liga" 0';

  return ligatures
    ? `"calt", "liga", ${Array.from({ length: 10 }, (_, i) => `"ss${String(i + 1).padStart(2, "0")}"`).join(", ")}`
    : '"calt", "liga" 0';
}

/** A CSS font-family value for one family name. */
export function fontFamilyValue(family: string): string {
  return `"${family.replace(/["\\]/g, "\\$&")}"`;
}
