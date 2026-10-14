import os from "node:os";
import path from "node:path";

import { configDefaults, defineConfig } from "vitest/config";

import { workspaceTestAliases } from "./test-config";

export default defineConfig({
  test: {
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    env: {
      CHALK_REVIEW_HOME: path.join(
        os.tmpdir(),
        `progressive-review-tests-${process.pid}`,
      ),
      // Scratch repositories must resolve to their own remotes.
      GITHUB_REPOSITORY: "",
    },
    // Package test lanes share the CI runner; keep each lane on one worker.
    maxWorkers: 1,
    projects: [
      {
        resolve: { alias: workspaceTestAliases },
        test: {
          server: {
            deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
          },
          name: "shared-module-graph",
          environment: "node",
          isolate: false,
          include: ["src/**/*.test.ts"],
          exclude: configDefaults.exclude,
          // Integration cases can exceed Vitest's
          // 5 second default while sharing a two-core hosted runner.
          testTimeout: 15_000,
        },
      },
    ],
  },
});
