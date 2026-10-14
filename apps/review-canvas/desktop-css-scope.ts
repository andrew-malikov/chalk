const REVIEW_CANVAS_SCOPE = ".review-canvas-root";

const REVIEW_CANVAS_ROOT_RULE = /\.review-canvas-root\s*\{/g;

// Font faces and property registrations must be outside @scope. Tailwind
// uses @property to initialize its prefixed shadow and focus-ring variables.
const GLOBAL_RULE = /@(?:font-face|property\s+[\w-]+)\s*\{[^}]*\}/g;

export function scopeReviewCanvasCss(source: string): string {
  const globalRules = source.match(GLOBAL_RULE) ?? [];
  const withoutGlobalRules = source.replace(GLOBAL_RULE, "");

  const scopedSource = withoutGlobalRules
    .replace(REVIEW_CANVAS_ROOT_RULE, ":scope{")
    .replaceAll(/:root\b|:host\b/g, ":scope");

  const globalBlock = globalRules.length ? `${globalRules.join("\n")}\n` : "";

  return `${globalBlock}@scope (${REVIEW_CANVAS_SCOPE}) {\n${scopedSource}\n}\n`;
}
