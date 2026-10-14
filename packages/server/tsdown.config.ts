import { execFileSync } from "node:child_process";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsdown";

const packageRoot = dirname(fileURLToPath(import.meta.url));

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
  entry: {
    index: "src/index.ts",
  },
  platform: "node",
  target: "esnext",
  format: "esm",
  outDir: "dist",
  fixedExtension: false,
  // Declaration inputs include sibling workspace sources; tsgo emits relative
  // to the config directory, so that directory must contain the whole graph.
  dts: { tsconfig: "../../tsconfig.server-build.json" },
  deps: {
    alwaysBundle: [
      /^@chalk\//,
      /^@dev\.fast\/diffr$/,
      /^isomorphic-git$/,
      // Bundled to keep its KaTeX dependency out of the runtime.
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
      resolve(packageRoot, "dist", "build-info.json"),
      JSON.stringify({
        version: pkg.version,
        commit: buildCommit,
        dirty: buildChanges === null ? null : buildChanges.length > 0,
        builtAt: new Date().toISOString(),
      }) + "\n",
    );

    await rm(resolve(packageRoot, "assets"), { recursive: true, force: true });
    await cp(
      resolve(packageRoot, "../tutorial/assets"),
      resolve(packageRoot, "assets"),
      { recursive: true },
    );

    await cp(
      resolve(packageRoot, "../review/instructions"),
      resolve(packageRoot, "instructions"),
      { recursive: true },
    );
    await cp(
      resolve(packageRoot, "../review/THIRD_PARTY_NOTICES.md"),
      resolve(packageRoot, "THIRD_PARTY_NOTICES.md"),
    );
  },
});
