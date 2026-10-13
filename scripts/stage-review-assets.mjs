import { execFile } from "node:child_process";
import { chmod, copyFile, cp, mkdir, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const monorepoRoot = path.resolve(import.meta.dirname, "..");

const diffrName = process.platform === "win32" ? "diffr.exe" : "diffr";

export async function stageReviewDocs(
  runtimeRoot,
  sourceDocsRoot = path.join(monorepoRoot, "docs"),
) {
  const destination = path.join(runtimeRoot, "docs");
  await rm(destination, { recursive: true, force: true });
  await cp(sourceDocsRoot, destination, { recursive: true });

  return destination;
}

export async function stageDiffrBinary(
  runtimeRoot,
  source = path.join(monorepoRoot, "packages", "review", "bin", diffrName),
) {
  if (!(await stat(source).catch(() => null))?.isFile()) {
    throw new Error(
      `Missing ${source}. Run bun run --filter @blackboard/review ensure:diffr before packaging.`,
    );
  }

  const require = createRequire(
    path.join(monorepoRoot, "packages/review/package.json"),
  );

  const packageRoot = path.dirname(
    require.resolve("@dev.fast/diffr/package.json"),
  );

  await execFileAsync(process.execPath, [
    path.join(packageRoot, "bin/fetch.mjs"),
    "--check",
    "--into",
    path.dirname(source),
  ]);

  const destination = path.join(runtimeRoot, "bin", diffrName);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const installerRoot = path.join(runtimeRoot, "bin/diffr-package");
  await mkdir(path.join(installerRoot, "bin"), { recursive: true });

  for (const file of ["package.json", "pins.json", "bin/fetch.mjs"]) {
    await copyFile(
      path.join(packageRoot, file),
      path.join(installerRoot, file),
    );
  }

  await chmod(destination, 0o755);
}
