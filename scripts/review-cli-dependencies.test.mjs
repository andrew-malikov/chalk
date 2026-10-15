import assert from "node:assert/strict";
import test from "node:test";

import { checkProductionDependencies } from "./review-cli-dependencies.mjs";

for (const name of [
  "playwright-core",
  "vite-plus",
  "@voidzero-dev/vite-plus-core",
]) {
  test(`rejects transitive development tooling: ${name}`, () => {
    assert.throws(
      () =>
        checkProductionDependencies({
          dependencies: {
            "@chalk/review": {
              dependencies: {
                "innocent-library": {
                  dependencies: { [name]: { version: "1.0.0" } },
                },
              },
            },
          },
        }),
      new RegExp(`@chalk/review -> innocent-library -> ${name}`),
    );
  });
}

test("accepts runtime libraries, including platform-specific image binaries", () => {
  assert.equal(
    checkProductionDependencies({
      dependencies: {
        sharp: {
          version: "1.0.0",
          dependencies: { "@img/sharp-linux-x64": { version: "1.0.0" } },
        },
        hono: { version: "1.0.0" },
      },
    }),
    3,
  );
});
