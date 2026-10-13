import { execFileSync } from "node:child_process";
import { chmod, copyFile, cp, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsdown";

const packageRoot = dirname(fileURLToPath(import.meta.url));

const reviewRoot = resolve(packageRoot, "../review");

function gitOutput(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const buildCommit = gitOutput(["rev-parse", "HEAD"]);

const buildChanges = gitOutput(["status", "--porcelain"]);

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  platform: "node",
  target: "esnext",
  format: "esm",
  outDir: "dist",
  fixedExtension: false,
  dts: false,
  deps: {
    alwaysBundle: [
      /^@blackboard\//,
      /^@dev\.fast\/diffr$/,
      /^isomorphic-git$/,
      /^micromark-extension-math$/,
    ],
    onlyBundle: false,
    neverBundle: ["typescript"],
  },
  async onSuccess() {
    const pkg = JSON.parse(
      await readFile(resolve(packageRoot, "package.json"), "utf8"),
    );

    await writeFile(
      resolve(packageRoot, "dist/build-info.json"),
      JSON.stringify({
        version: pkg.version,
        commit: buildCommit,
        dirty: buildChanges === null ? null : buildChanges.length > 0,
        builtAt: new Date().toISOString(),
      }) + "\n",
    );

    const cliPath = resolve(packageRoot, "dist/cli.js");
    const contents = await readFile(cliPath, "utf8");
    const body = contents.replace(/^(?:#![^\n]*\n|\s*\n)+/, "");
    await writeFile(cliPath, `#!/usr/bin/env bun\n${body}`, "utf8");
    await chmod(cliPath, 0o755);

    await cp(
      resolve(reviewRoot, "instructions"),
      resolve(packageRoot, "instructions"),
      {
        recursive: true,
      },
    );
    await copyFile(
      resolve(reviewRoot, "THIRD_PARTY_NOTICES.md"),
      resolve(packageRoot, "THIRD_PARTY_NOTICES.md"),
    );
  },
});
