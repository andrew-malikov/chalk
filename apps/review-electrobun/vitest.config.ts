import { defineConfig } from "vitest/config";

import { workspaceTestAliases } from "../../scripts/test-config";

export default defineConfig({
  resolve: { alias: workspaceTestAliases },
  test: {
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
