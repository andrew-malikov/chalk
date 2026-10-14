const LIBAVOID_BROWSER_MODULE =
  /[/\\]libavoid-js[/\\]dist[/\\]index\.js(?:\?.*)?$/;

import type { Plugin } from "vite";

// This policy is private to Pierre's escaped, generated markup. Never install
// a default policy: other workbench HTML sinks must remain protected.
export function pierreTrustedTypesPlugin(): Plugin {
  const module = "virtual:review-pierre-trusted-html";
  return {
    name: "harden-pierre-trusted-types",
    enforce: "pre",
    resolveId(id) {
      if (id === module) return `\0${module}`;
    },
    load(id) {
      if (id !== `\0${module}`) return;
      return `const policy = globalThis.trustedTypes?.createPolicy("reviewPierre", { createHTML: value => value });
export const __reviewPierreHtml = value => policy ? policy.createHTML(value) : value;`;
    },
    transform(source, id) {
      if (!/[/\\]@pierre[/\\]diffs[/\\]dist[/\\].*\.js(?:\?.*)?$/.test(id))
        return;
      const hardened = hardenPierreForTrustedTypes(source);
      if (hardened === source) return;
      return {
        code: `import { __reviewPierreHtml } from "${module}";\n${hardened}`,
        map: null,
      };
    },
  };
}

export function hardenPierreForTrustedTypes(source: string): string {
  // Pierre 1.5.1 emits each HTML write on a single line. Keep the transform
  // scoped to this pinned dependency; the browser gate exercises its sinks.
  return source
    .replaceAll(
      /\.innerHTML = ([^;\n]+);/g,
      ".innerHTML = __reviewPierreHtml($1);",
    )
    .replaceAll(
      /\.insertAdjacentHTML\(([^,\n]+), ([^;\n]+)\);/g,
      ".insertAdjacentHTML($1, __reviewPierreHtml($2));",
    );
}

const LIBAVOID_TRUSTED_TYPES_BOOTSTRAP = `
const __reviewLibavoidTrustedTypesPolicy = globalThis.trustedTypes?.createPolicy?.(
  "reviewLibavoid",
  { createScript: (value) => value },
);
function __reviewLibavoidDynamicFunction(...args) {
  const trustedArgs = args.map(
    (value) =>
      __reviewLibavoidTrustedTypesPolicy?.createScript(String(value)) ?? value,
  );
  return globalThis.Function(...trustedArgs);
}
`;

export function isLibavoidBrowserModule(moduleId: string): boolean {
  return LIBAVOID_BROWSER_MODULE.test(moduleId);
}

export function hardenLibavoidForTrustedTypes(source: string): string {
  const dynamicFunctionPattern = /\bnew Function\(/g;
  const occurrences = source.match(dynamicFunctionPattern)?.length ?? 0;

  if (occurrences === 0) {
    throw new Error(
      "libavoid browser bundle no longer contains the expected Emscripten Function constructors",
    );
  }

  return `${LIBAVOID_TRUSTED_TYPES_BOOTSTRAP}\n${source.replaceAll(
    dynamicFunctionPattern,
    "new __reviewLibavoidDynamicFunction(",
  )}`;
}
