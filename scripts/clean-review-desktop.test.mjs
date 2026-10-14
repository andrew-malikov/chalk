import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { cleanReviewDesktop } from "./clean-review-desktop.mjs";

test("cleans Electrobun outputs while preserving the SDK, source and user data", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "blackboard-clean-"));

  const generated = [
    "dist",
    "runtime",
    "build",
    "artifacts",
    ".cottontail-tmp",
  ];

  const retained = [
    ".hutch/devkit/api.ts",
    "src/main.ts",
    "profile/review-api.db",
  ];

  const app = path.join(root, "apps/review-electrobun");

  try {
    for (const directory of generated) {
      await mkdir(path.join(app, directory), { recursive: true });
      await writeFile(path.join(app, directory, "output"), "generated");
    }

    for (const file of retained) {
      await mkdir(path.dirname(path.join(app, file)), { recursive: true });
      await writeFile(path.join(app, file), "keep");
    }

    await cleanReviewDesktop({ root, reviewHome: path.join(root, "profile") });

    for (const directory of generated)
      await assert.rejects(access(path.join(app, directory)), /ENOENT/);

    for (const file of retained) await access(path.join(app, file));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
