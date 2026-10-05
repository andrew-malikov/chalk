import { defineConfig } from "vitest/config";

import { reviewTestAliases } from "../../packages/review/test-config";

export default defineConfig({
  resolve: { alias: reviewTestAliases },
  test: {
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
