import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    clearMocks: false,
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
