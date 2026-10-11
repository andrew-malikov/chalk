import os from "node:os";
import path from "node:path";

import { configDefaults, defineConfig } from "vitest/config";

import { reviewTestAliases } from "./test-config";

export default defineConfig({
  test: {
    server: {
      deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
    },
    env: {
      DEV_REVIEW_HOME: path.join(
        os.tmpdir(),
        `progressive-review-tests-${process.pid}`,
      ),
      // Scratch repositories must resolve to their own remotes.
      GITHUB_REPOSITORY: "",
    },
    // The repository gate runs package lanes concurrently on a two-core host.
    // Keep Review on one worker so it does not starve the other lanes.
    maxWorkers: 1,
    projects: [
      {
        resolve: { alias: reviewTestAliases },
        test: {
          server: {
            deps: { inline: ["zod", "eventsource-parser", "@dev.fast/diffr"] },
          },
          name: "shared-module-graph",
          environment: "node",
          isolate: false,
          exclude: [...configDefaults.exclude, "app/**"],
          // Integration cases can exceed Vitest's
          // 5 second default while sharing a two-core hosted runner.
          testTimeout: 15_000,
        },
      },
    ],
  },
});
