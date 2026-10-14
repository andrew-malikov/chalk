import { defineConfig } from "vitest/config";

import { workspaceTestAliases } from "../../scripts/test-config";

export default defineConfig({
  resolve: { alias: workspaceTestAliases },
  test: {
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    include: ["src/review-api/*.integration.ts", "scripts/*.integration.mjs"],
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
