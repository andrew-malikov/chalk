#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  jsonNumber,
  jsonObject,
  jsonString,
  parseJsonText,
} from "@blackboard/review-protocol";

// A standalone build (npx/global install) defers to the CLI bundled with a
// running Review Desktop so the CLI can never skew from the server it talks
// to. Checkout runs execute src/cli.ts with Bun and therefore never delegate.
// Delegation runs before the runtime check so the app can provide its Bun.
const argv = process.argv.slice(2);

const ownCliPath = fileURLToPath(import.meta.url);

const delegatedExitCode = await maybeDelegateToDesktopCli(argv);

process.exitCode = delegatedExitCode ?? (await runCli(ownCliPath));

async function runCli(effectivePath: string): Promise<number> {
  if (!supportedBunRuntime()) {
    process.stderr.write(
      `Blackboard needs Bun 1.4.2 or newer; found ${process.versions.bun ?? "a different runtime"}. ` +
        "Install Bun, or use the blackboard command installed by Blackboard Desktop.\n",
    );

    return 1;
  }

  const { runReviewCli } = await import("./cli/cli-runner.js");

  return runReviewCli({
    argv,
    cliPaths: { requestedPath: ownCliPath, effectivePath },
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}

function supportedBunRuntime(): boolean {
  const [major = 0, minor = 0, patch = 0] = (process.versions.bun ?? "")
    .split(".")
    .map(Number);

  return (
    major > 1 || (major === 1 && (minor > 4 || (minor === 4 && patch >= 2)))
  );
}

async function maybeDelegateToDesktopCli(
  argv: string[],
): Promise<number | null> {
  const env = process.env;

  if (env.DEV_FAST_REVIEW_CLI_NO_DELEGATE || env.DEV_FAST_REVIEW_CLI_DELEGATED)
    return null;

  // api and mcp are thin HTTP clients whose tool catalog comes from the
  // server, so they cannot skew from it and must not be handed to a bundled
  // CLI that predates them.
  if (
    argv.some(
      (argument) =>
        ["api", "mcp", "server", "instances"].includes(argument) ||
        /^--state-dir(?:=|$)/.test(argument),
    ) ||
    env.DEV_REVIEW_SERVER_DIR?.trim()
  )
    return null;
  const ownPath = fileURLToPath(import.meta.url);

  if (!/[\\/]dist[\\/]cli\.js$/.test(ownPath)) return null;

  // Keep bootstrap independent of the server module graph until runtime validation.
  // Keep this selection in step with devReviewHome().
  const devHome = env.DEV_REVIEW_HOME?.trim()
    ? path.resolve(env.DEV_REVIEW_HOME.trim())
    : path.join(os.homedir(), ".dev");

  let cliPath: string;
  let runtimePath: string | undefined;
  const discoveryFile = selectedDiscoveryFile(devHome, env);

  if (!discoveryFile) return null;

  try {
    const discovery = jsonObject(
      parseJsonText(readFileSync(discoveryFile, "utf8")),
    );

    const discoveredCliPath = jsonString(discovery?.cliPath);

    if (!discoveredCliPath) return null;
    cliPath = discoveredCliPath;
    const discoveredRuntimePath = jsonString(discovery?.cliRuntimePath);

    if (discoveredRuntimePath && existsSync(discoveredRuntimePath)) {
      runtimePath = discoveredRuntimePath;
    }
  } catch {
    return null;
  }

  try {
    if (realpathSync(cliPath) === realpathSync(ownPath)) return null;
  } catch {
    return null;
  }

  // Prefer the app runtime so the CLI matches the selected server.
  const childEnv: NodeJS.ProcessEnv = {
    ...env,
    DEV_FAST_REVIEW_CLI_DELEGATED: "1",
  };

  // Older desktops advertise Electron as their CLI runtime; Bun ignores this flag.
  if (runtimePath) childEnv.ELECTRON_RUN_AS_NODE = "1";

  // The current parser owns verbose diagnostics, including usage errors and
  // help, even when the selected Desktop CLI predates this option.
  const command = argv.filter((argument) => argument !== "--json");

  if (command[0] === "version" && command.includes("--verbose")) {
    return runCli(cliPath);
  }

  const result = spawnSync(
    runtimePath ?? process.execPath,
    [cliPath, ...argv],
    { stdio: "inherit", env: childEnv },
  );

  if (result.signal) {
    process.kill(process.pid, result.signal);

    return 1;
  }

  return result.status ?? 1;
}

/**
 * The shim's selection, kept in step with it and with selectReviewInstance:
 * DEV_REVIEW_INSTANCE, the machine default, the only live Desktop, then
 * stable, then the pre-instance server.json.
 */
function selectedDiscoveryFile(devHome: string, env: NodeJS.ProcessEnv) {
  const desktop = path.join(devHome, "review-desktop");
  const instances = path.join(desktop, "instances");
  let key = env.DEV_REVIEW_INSTANCE?.trim();

  try {
    key ||= readFileSync(path.join(desktop, "default-instance"), "utf8").trim();
  } catch {
    // No machine default.
  }

  // Keys name files; the CLI rejects anything else.
  if (key && !/^[A-Za-z0-9_.-]+$/.test(key)) return undefined;

  // A stable Desktop that predates instances wrote only server.json; it never
  // stands in for any other key.
  const legacy = path.join(desktop, "server.json");
  let stable = path.join(instances, "stable.json");

  if (!existsSync(stable)) stable = legacy;

  let selected =
    key === "stable" ? stable : key && path.join(instances, `${key}.json`);

  if (!selected) {
    let names: string[] = [];

    try {
      names = readdirSync(instances).filter((name) => name.endsWith(".json"));
    } catch {
      // No instance has started yet.
    }

    const live = [
      ...names.map((name) => path.join(instances, name)),
      ...(stable === legacy ? [legacy] : []),
    ].filter(recordIsLive);

    selected = live.length === 1 ? live[0]! : stable;
  }

  return recordIsLive(selected) ? selected : undefined;
}

function recordIsLive(filePath: string) {
  try {
    const serverPid = jsonNumber(
      jsonObject(parseJsonText(readFileSync(filePath, "utf8")))?.serverPid,
    );

    return serverPid !== undefined && processIsAlive(serverPid);
  } catch {
    return false;
  }
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}
