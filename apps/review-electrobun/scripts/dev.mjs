import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const checkout = path.resolve(app, "../..");

const release = process.argv[2] === "release";

if (!process.versions.bun) {
  throw new Error("Chalk requires Bun 1.4.2 or newer. Run: bun dev");
}

const installedHutch = path.join(homedir(), ".hutch/bin/hutch");

const hutch = existsSync(installedHutch) ? installedHutch : "hutch";

const env = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ""}`,
  HUTCH_NO_UPDATE_CHECK: "1",
  REVIEW_ELECTROBUN_BUN: process.execPath,
  CHALK_REVIEW_CHECKOUT: checkout,
  CHALK_REVIEW_SERVER_ENTRY: path.join(
    checkout,
    "apps/review-electrobun/runtime/dist/desktop-host.js",
  ),
};

function run(command, args, cwd = app, overrides = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...env, ...overrides },
    stdio: "inherit",
  });

  if (result.error)
    throw new Error(`Cannot run ${command}: ${result.error.message}`);

  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["run", "--filter", "@chalk/server", "build"], checkout);

run(process.execPath, ["run", "--filter", "@chalk/cli", "build"], checkout);

run(process.execPath, ["run", "host:build"]);

// Installed apps have no Bun of their own for the host sidecar.
if (release) {
  mkdirSync(path.join(app, "runtime/bin"), { recursive: true });
  copyFileSync(process.execPath, path.join(app, "runtime/bin/bun"));
}

run(hutch, ["electrobun", "prepare"]);

run(process.execPath, ["x", "--bun", "--no-install", "vp", "build"], app);

run(hutch, ["electrobun", "build", `--env=${release ? "stable" : "dev"}`]);

if (process.argv[2] === "dev") run(hutch, ["electrobun", "run"]);
