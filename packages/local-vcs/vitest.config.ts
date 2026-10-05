import { configDefaults, defineConfig } from "vitest/config";

const isolatedTests = ["src/index.cache.test.ts"];

export default defineConfig({
  test: {
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    projects: [
      {
        extends: true,
        test: {
          server: {
            deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
          },
          name: "shared-module-graph",
          environment: "node",
          isolate: false,
          exclude: [...configDefaults.exclude, ...isolatedTests],
        },
      },
      {
        extends: true,
        test: {
          server: {
            deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
          },
          name: "isolated",
          environment: "node",
          include: isolatedTests,
        },
      },
    ],
  },
});
