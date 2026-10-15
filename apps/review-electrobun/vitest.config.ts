import { defineConfig } from "vite-plus";

import { workspaceTestAliases } from "../../scripts/test-config";

export default defineConfig({
  resolve: { alias: workspaceTestAliases },
  test: {
    clearMocks: false,
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
