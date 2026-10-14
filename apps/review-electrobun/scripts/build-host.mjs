import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stageDiffrBinary } from "../../../scripts/stage-review-assets.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const runtime = path.join(app, "runtime");

const result = spawnSync(
  process.execPath,
  ["--bun", "run", "tsdown", "--config", "tsdown.host.config.ts"],
  { cwd: app, stdio: "inherit" },
);

if (result.error) throw result.error;

if (result.status !== 0) process.exit(result.status ?? 1);

for (const name of ["instructions", "THIRD_PARTY_NOTICES.md"]) {
  cpSync(
    path.join(app, "../../packages/review", name),
    path.join(runtime, name),
    {
      recursive: true,
    },
  );
}

cpSync(
  path.join(app, "../../packages/tutorial/assets"),
  path.join(runtime, "assets"),
  {
    recursive: true,
  },
);

cpSync(path.join(app, "package.json"), path.join(runtime, "package.json"));

const diffr = process.platform === "win32" ? "diffr.exe" : "diffr";

if (existsSync(path.join(app, "../../packages/review/bin", diffr))) {
  await stageDiffrBinary(runtime);
}

let commit = null;

let dirty = null;

try {
  const options = {
    cwd: app,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  };

  commit = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
  dirty = execFileSync("git", ["status", "--porcelain"], options).trim() !== "";
} catch {
  // Source archives can be built without Git metadata.
}

const { version } = JSON.parse(
  readFileSync(path.join(app, "package.json"), "utf8"),
);

writeFileSync(
  path.join(runtime, "dist/build-info.json"),
  JSON.stringify({
    version,
    commit,
    dirty,
    builtAt: new Date().toISOString(),
  }) + "\n",
);
