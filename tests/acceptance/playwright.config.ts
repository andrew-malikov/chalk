import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

export default defineConfig({
  testDir: defineBddConfig({
    features: "../../features/**/*.feature",
    featuresRoot: fileURLToPath(new URL("../../features", import.meta.url)),
    steps: ["./steps/**/*.ts", "./support/fixtures.ts"],
    outputDir: "./.features-gen",
  }),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  outputDir: "./test-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "./playwright-report", open: "never" }],
  ],
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4175",
    viewport: { width: 1280, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "bunx --bun --no-install vp dev --config tests/acceptance/vite.config.ts",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
