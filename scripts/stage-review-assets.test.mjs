import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { stageDiffrBinary, stageReviewDocs } from "./stage-review-assets.mjs";

const temporaryRoots = [];

after(async () => {
  await Promise.all(
    temporaryRoots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function temporaryRoot(prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);

  return root;
}

test("stages the complete Review documentation tree under the runtime root", async () => {
  const root = await temporaryRoot("review-runtime-docs-");
  const runtimeRoot = path.join(root, "review-runtime");
  const docsRoot = path.join(root, "source-docs");
  await mkdir(path.join(runtimeRoot, "docs"), { recursive: true });
  await mkdir(path.join(docsRoot, "assets"), { recursive: true });
  await writeFile(path.join(runtimeRoot, "docs", "stale.md"), "stale\n");
  await writeFile(path.join(docsRoot, "README.md"), "# Review docs\n");
  await writeFile(path.join(docsRoot, "guide.md"), "# Guide\n");
  await writeFile(
    path.join(docsRoot, "assets", "image.png"),
    Buffer.from([0, 1, 2, 3]),
  );

  const destination = await stageReviewDocs(runtimeRoot, docsRoot);
  assert.equal(destination, path.join(runtimeRoot, "docs"));

  assert.equal(
    await readFile(path.join(destination, "README.md"), "utf8"),
    "# Review docs\n",
  );
  assert.equal(
    await readFile(path.join(destination, "guide.md"), "utf8"),
    "# Guide\n",
  );
  assert.deepEqual(
    await readFile(path.join(destination, "assets", "image.png")),
    Buffer.from([0, 1, 2, 3]),
  );
  await assert.rejects(readFile(path.join(destination, "stale.md")), /ENOENT/);
});

test("diffr staging rejects a missing executable", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "review-diffr-stage-"));

  try {
    await assert.rejects(
      stageDiffrBinary(path.join(root, "runtime"), path.join(root, "diffr")),
      /bun install/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
