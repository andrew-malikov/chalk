import { chmod, copyFile, cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { diffrBinaryPath } from "@dev.fast/diffr";

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
  source = diffrBinaryPath(),
) {
  if (!source || !(await stat(source).catch(() => null))?.isFile()) {
    throw new Error(
      `Missing the diffr executable for ${process.platform}-${process.arch}. Run bun install before packaging.`,
    );
  }

  const destination = path.join(runtimeRoot, "bin", diffrName);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await chmod(destination, 0o755);
}
