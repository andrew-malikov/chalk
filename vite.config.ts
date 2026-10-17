import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    plugins: ["typescript", "oxc", "react", "jsx-a11y", "vitest"],
    categories: {
      correctness: "error",
      suspicious: "error",
      perf: "error",
    },
    settings: {
      react: {
        version: "19.0.0",
      },
      vitest: {
        typecheck: false,
      },
    },
    env: {
      builtin: true,
    },
    globals: {},
    ignorePatterns: [
      "tests/acceptance/.features-gen/**",
      "tests/acceptance/test-results/**",
      "tests/acceptance/playwright-report/**",
      ".vite/**",
      "dist/**",
      "**/dist/**",
      "**/.vite/**",
      "**/.hutch/**",
      "**/build/**",
      "**/artifacts/**",
      "**/.cottontail-tmp/**",
      ".agent/**",
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".continue/**",
      ".cursor/**",
      ".gemini/**",
      ".opencode/**",
      ".pi/**",
      ".roo/**",
      ".windsurf/**",
      "tools/oxlint/anti-slop/**",
    ],
    rules: {
      // Preserve the React rules enabled before the Vite+ migration.
      "react/capitalized-calls": "off",
      "react/error-boundaries": "off",
      "react/exhaustive-effect-dependencies": "off",
      "react/globals": "off",
      "react/hooks": "off",
      "react/immutability": "off",
      "react/incompatible-library": "off",
      "react/memo-dependencies": "off",
      "react/no-deriving-state-in-effects": "off",
      "react/no-object-type-as-default-prop": "off",
      "react/no-unstable-nested-components": "off",
      "react/preserve-manual-memoization": "off",
      "react/purity": "off",
      "react/refs": "off",
      "react/set-state-in-effect": "off",
      "react/set-state-in-render": "off",
      "react/static-components": "off",
      "react/use-memo": "off",
      "react/void-use-memo": "off",
      "sort-imports": [
        "error",
        {
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          ignoreCase: false,
          memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
        },
      ],
      "typescript/no-explicit-any": "off",
      "typescript/no-non-null-assertion": "off",
      "typescript/array-type": "off",
      "typescript/no-this-alias": "off",
      "react/react-in-jsx-scope": "off",
      "react/exhaustive-deps": "off",
      "react/no-array-index-key": "off",
      "react/no-danger": "off",
      "no-await-in-loop": "off",
      "no-control-regex": "off",
      "no-shadow": "off",
      "no-underscore-dangle": "off",
      "no-unused-vars": "off",
      "no-useless-escape": "off",
      "no-unsafe-optional-chaining": "off",
      "prefer-destructuring": "off",
      "preserve-caught-error": "off",
      "require-yield": "off",
      "max-lines": "off",
      "oxc/no-map-spread": "off",
      "oxc/only-used-in-recursion": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/no-noninteractive-tabindex": "off",
      "jsx-a11y/prefer-tag-over-role": "off",
      "jsx-a11y/role-has-required-aria-props": "off",
      "no-unmodified-loop-condition": "off",
      "oxc/no-accumulating-spread": "error",
      "anti-slop/no-array-filter-map": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/require-readable-spacing": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
    },
    jsPlugins: [
      {
        name: "anti-slop",
        specifier: "./tools/oxlint/anti-slop/index.ts",
      },
    ],
    overrides: [
      {
        files: ["**/*.test.ts", "**/*.test.tsx"],
        rules: {
          "anti-slop/require-safety-comment-for-type-assertion": "off",
        },
      },
      {
        files: ["packages/json/src/runtime-value.ts"],
        rules: {
          "anti-slop/no-runtime-typeof": "off",
        },
      },
      {
        files: [
          "packages/review/src/**",
          "apps/review-canvas/src/**",
          "packages/server/src/**",
          "packages/mcp/src/**",
        ],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "../**",
                    "!**/test/fixtures/**",
                    "!**/test-config*",
                    "!**/tutorial/*.json",
                    "!**/desktop-css-scope",
                    "!**/agent-plugins/**",
                  ],
                  message:
                    "Import through source aliases or workspace packages; run scripts/rewrite-relative-imports.mjs.",
                },
              ],
            },
          ],
        },
      },
      {
        files: ["packages/trace-core/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: ["@chalk/review"],
              patterns: ["@chalk/review/*", "**/review/**"],
            },
          ],
        },
      },
      {
        files: ["packages/review/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "../**",
                    "!**/test/fixtures/**",
                    "!**/test-config*",
                    "!**/tutorial/*.json",
                    "!**/desktop-css-scope",
                    "!**/agent-plugins/**",
                  ],
                  message:
                    "Import through source aliases or workspace packages; run scripts/rewrite-relative-imports.mjs.",
                },
                {
                  group: [
                    "@chalk/server",
                    "@chalk/server/**",
                    "@chalk/cli",
                    "@cli/**",
                    "@shell/**",
                    "@chalk/review-electrobun",
                    "@chalk/review-electrobun/**",
                  ],
                  message:
                    "Review logic must not depend on CLI, server, or desktop wrappers.",
                },
              ],
            },
          ],
        },
      },
      {
        files: ["packages/server/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "../**",
                    "!**/test/fixtures/**",
                    "!**/test-config*",
                    "!**/tutorial/*.json",
                    "!**/desktop-css-scope",
                    "!**/agent-plugins/**",
                  ],
                  message:
                    "Import through source aliases or workspace packages; run scripts/rewrite-relative-imports.mjs.",
                },
                {
                  group: [
                    "@chalk/cli",
                    "@cli/**",
                    "@shell/**",
                    "@chalk/review-electrobun",
                    "@chalk/review-electrobun/**",
                  ],
                  message:
                    "The server must not depend on CLI or desktop wrappers.",
                },
              ],
            },
          ],
        },
      },
      {
        files: [
          "packages/review/src/documents/**",
          "packages/review/src/blocks/**",
          "packages/review/src/lib/**",
          "packages/review/src/software-map/**",
          "apps/review-canvas/src/**",
        ],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "../**",
                    "!**/test/fixtures/**",
                    "!**/test-config*",
                    "!**/tutorial/*.json",
                    "!**/desktop-css-scope",
                    "!**/agent-plugins/**",
                  ],
                  message:
                    "Import through source aliases or workspace packages; run scripts/rewrite-relative-imports.mjs.",
                },
                {
                  group: [
                    "@review/node/**",
                    "@chalk/review/node/**",
                    "node:*",
                    "bun:*",
                  ],
                  message:
                    "Browser modules must not load review runtime modules or Node/Bun APIs; type-only imports are safe.",
                  allowTypeImports: true,
                },
                {
                  group: [
                    "@chalk/server",
                    "@chalk/server/**",
                    "@chalk/cli",
                    "@cli/**",
                    "@shell/**",
                    "@chalk/review-electrobun",
                    "@chalk/review-electrobun/**",
                  ],
                  message:
                    "Review logic must not depend on CLI, server, or desktop wrappers.",
                },
              ],
            },
          ],
        },
      },
      {
        files: [
          "packages/server/src/**/*.test.ts",
          "packages/server/src/**/*.test.tsx",
          "apps/review-canvas/src/**/*.test.ts",
          "apps/review-canvas/src/**/*.test.tsx",
        ],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "../**",
                    "!**/test/fixtures/**",
                    "!**/test-config*",
                    "!**/tutorial/*.json",
                    "!**/desktop-css-scope",
                    "!**/agent-plugins/**",
                  ],
                  message:
                    "Import through source aliases or workspace packages; run scripts/rewrite-relative-imports.mjs.",
                },
              ],
            },
          ],
        },
      },
      {
        files: [
          "packages/review/src/documents/**/*.test.ts",
          "packages/review/src/documents/**/*.test.tsx",
          "packages/review/src/blocks/**/*.test.ts",
          "packages/review/src/blocks/**/*.test.tsx",
          "packages/review/src/lib/**/*.test.ts",
          "packages/review/src/lib/**/*.test.tsx",
          "packages/review/src/software-map/**/*.test.ts",
          "packages/review/src/software-map/**/*.test.tsx",
        ],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "../**",
                    "!**/test/fixtures/**",
                    "!**/test-config*",
                    "!**/tutorial/*.json",
                    "!**/desktop-css-scope",
                    "!**/agent-plugins/**",
                  ],
                  message:
                    "Import through source aliases or workspace packages; run scripts/rewrite-relative-imports.mjs.",
                },
                {
                  group: [
                    "@chalk/server",
                    "@chalk/server/**",
                    "@chalk/cli",
                    "@cli/**",
                    "@shell/**",
                    "@chalk/review-electrobun",
                    "@chalk/review-electrobun/**",
                  ],
                  message:
                    "Review logic must not depend on CLI, server, or desktop wrappers.",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  fmt: {
    useTabs: false,
    tabWidth: 2,
    printWidth: 80,
    singleQuote: false,
    jsxSingleQuote: false,
    quoteProps: "as-needed",
    trailingComma: "all",
    semi: true,
    arrowParens: "always",
    bracketSameLine: false,
    bracketSpacing: true,
    sortImports: {
      newlinesBetween: true,
      sortSideEffects: false,
      partitionByComment: false,
      partitionByNewline: false,
    },
    ignorePatterns: [
      "tests/acceptance/.features-gen/**",
      "tests/acceptance/test-results/**",
      "tests/acceptance/playwright-report/**",
      ".vite/**",
      "dist/**",
      "**/dist/**",
      "**/.claude/**",
      "**/.vite/**",
      "**/.hutch/**",
      "**/build/**",
      "**/artifacts/**",
      "**/.cottontail-tmp/**",
      ".agent/**",
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".continue/**",
      ".cursor/**",
      ".gemini/**",
      ".opencode/**",
      ".pi/**",
      ".roo/**",
      ".windsurf/**",
      "tools/oxlint/anti-slop/**",
    ],
  },
});
