import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const checkout = path.resolve(app, "../..");

if (!process.versions.bun) {
  throw new Error("Blackboard requires Bun 1.4.2 or newer. Run: bun dev");
}

const installedHutch = path.join(homedir(), ".hutch/bin/hutch");

const hutch = existsSync(installedHutch) ? installedHutch : "hutch";

const env = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ""}`,
  HUTCH_NO_UPDATE_CHECK: "1",
  REVIEW_ELECTROBUN_BUN: process.execPath,
  DEV_FAST_REVIEW_CHECKOUT: checkout,
  DEV_FAST_REVIEW_SERVER_ENTRY: path.join(
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

run(
  process.execPath,
  ["run", "--filter", "@blackboard/server", "build"],
  checkout,
);

run(
  process.execPath,
  ["run", "--filter", "@blackboard/cli", "build"],
  checkout,
);

run(process.execPath, ["run", "host:build"]);

run(hutch, ["electrobun", "prepare"]);

// Bun 1.4.2 FTL miscompiles StyleX media-query parsing; keep the baseline JIT.
run(process.execPath, ["--bun", "run", "vite", "build"], app, {
  BUN_JSC_useFTLJIT: "0",
});

run(hutch, ["electrobun", "build", "--env=dev"]);

if (process.argv[2] !== "build") run(hutch, ["electrobun", "run"]);
