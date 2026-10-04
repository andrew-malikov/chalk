import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkout = path.resolve(app, "../..");
if (Number(process.versions.node.split(".")[0]) !== 24) {
  throw new Error("Review requires Node 24. Run: fnm exec --using 24 pnpm electrobun:dev");
}
const installedHutch = path.join(homedir(), ".hutch/bin/hutch");
const hutch = existsSync(installedHutch) ? installedHutch : "hutch";
const env = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ""}`,
  HUTCH_NO_UPDATE_CHECK: "1",
  REVIEW_ELECTROBUN_NODE: process.execPath,
  DEV_FAST_REVIEW_CHECKOUT: checkout,
  DEV_FAST_REVIEW_SERVER_ENTRY: path.join(checkout, "packages/review/dist/server/desktop-host.js"),
};
function run(command, args, cwd = app) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw new Error(`Cannot run ${command}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("pnpm", ["--filter", "@dev.fast/review", "build"], checkout);
run(hutch, ["electrobun", "prepare"]);
run("pnpm", ["exec", "vite", "build"]);
run(hutch, ["electrobun", "build", "--env=dev"]);
if (process.argv[2] !== "build") run(hutch, ["electrobun", "run"]);
