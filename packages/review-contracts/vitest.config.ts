import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
