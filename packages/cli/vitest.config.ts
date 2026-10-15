import os from "node:os";
import path from "node:path";

import { defineConfig } from "vite-plus";

import { workspaceTestAliases } from "../../scripts/test-config";

export default defineConfig({
  resolve: { alias: workspaceTestAliases },
  test: {
    clearMocks: false,
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    env: {
      CHALK_REVIEW_HOME: path.join(
        os.tmpdir(),
        `review-cli-tests-${process.pid}`,
      ),
      GITHUB_REPOSITORY: "",
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
    isolate: false,
    maxWorkers: 1,
    testTimeout: 15_000,
  },
});
