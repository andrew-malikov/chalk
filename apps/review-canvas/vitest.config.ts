import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vite-plus";

import { workspaceTestAliases } from "../../scripts/test-config";

const require = createRequire(import.meta.url);

const alias = {
  ...workspaceTestAliases,
  "decode-named-character-reference": path.join(
    path.dirname(require.resolve("decode-named-character-reference")),
    "index.js",
  ),
};

export default defineConfig({
  test: {
    clearMocks: false,
    sharedViteServer: false,
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    env: {
      CHALK_REVIEW_HOME: path.join(
        os.tmpdir(),
        `review-canvas-tests-${process.pid}`,
      ),
      GITHUB_REPOSITORY: "",
    },
    maxWorkers: 1,
    projects: [
      {
        extends: false,
        resolve: {
          alias: {
            ...alias,
            "bun:sqlite": path.join(__dirname, "test-bun-sqlite.ts"),
          },
        },
        test: {
          clearMocks: false,
          server: {
            deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
          },
          name: "canvas-node",
          environment: "node",
          isolate: false,
          exclude: [
            ...configDefaults.exclude,
            "src/**/*.browser.test.{ts,tsx}",
          ],
          testTimeout: 15_000,
        },
      },
      {
        extends: false,
        plugins: [react(), tailwindcss()],
        resolve: { alias, dedupe: ["react", "react-dom"] },
        test: {
          clearMocks: false,
          server: {
            deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
          },
          name: "browser",
          maxWorkers: 1,
          include: ["src/**/*.browser.test.{ts,tsx}"],
          // Keep module mocks and browser state scoped to each test file.
          isolate: true,
          setupFiles: ["src/browser-test-setup.ts"],
          testTimeout: 15_000,
          browser: {
            locators: { exact: false },
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            viewport: { width: 1280, height: 900 },
            screenshotFailures: true,
            trace: process.env.CI === "true" ? "retain-on-failure" : "off",
          },
        },
      },
    ],
  },
});
