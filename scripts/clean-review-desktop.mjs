import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function cleanTargets({ root = monorepoRoot } = {}) {
  const app = resolve(root, "apps/review-electrobun");

  return ["dist", "runtime", "build", "artifacts", ".cottontail-tmp"].map(
    (directory) => resolve(app, directory),
  );
}

export async function cleanReviewDesktop(options) {
  const targets = cleanTargets(options);

  for (const target of targets) {
    if (!existsSync(target)) {
      console.log(`Already clean: ${target}`);
      continue;
    }

    await rm(target, { recursive: true, force: true });
    console.log(`Removed: ${target}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await cleanReviewDesktop();
}
