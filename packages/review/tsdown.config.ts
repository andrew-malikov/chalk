import { execFileSync } from "node:child_process";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsdown";

const packageRoot = dirname(fileURLToPath(import.meta.url));

const cliPath = resolve(packageRoot, "dist", "cli.js");

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

const desktopHostPath = resolve(
  packageRoot,
  "dist",
  "server",
  "desktop-host.js",
);

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    runtime: "src/runtime.ts",
    "server/desktop-host": "src/server/desktop-host.ts",
  },
  platform: "node",
  target: "esnext",
  format: "esm",
  outDir: "dist",
  fixedExtension: false,
  // Declaration inputs include sibling workspace sources; tsgo emits relative
  // to the config directory, so that directory must contain the whole graph.
  dts: { tsconfig: "../../tsconfig.review-build.json" },
  deps: {
    alwaysBundle: [
      /^@dev\.fast\/diffr$/,
      /^@dev\.fast\/json$/,
      /^@dev\.fast\/local-vcs$/,
      /^@dev\.fast\/review-protocol$/,
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
    await Promise.all(
      [cliPath, desktopHostPath].map(async (executablePath) => {
        await normalizeExecutable(executablePath);
        await chmod(executablePath, 0o755);
      }),
    );
  },
});

async function normalizeExecutable(filePath: string): Promise<void> {
  const shebang = "#!/usr/bin/env bun\n";
  const contents = await readFile(filePath, "utf8");
  const body = contents.replace(/^(?:#![^\n]*\n|\s*\n)+/, "");
  await writeFile(filePath, `${shebang}${body}`, "utf8");
}
