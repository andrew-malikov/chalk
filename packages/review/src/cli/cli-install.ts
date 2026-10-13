import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  type ReviewCliInstallStamp,
  ReviewCliInstallStampSchema,
  type ReviewCliInstallStatus,
} from "@blackboard/review-protocol";
import {
  writeFileAtomicAsync,
  writePrivateJsonAtomic,
} from "@review/lib/atomic-write";
import { isDirectory, isFile } from "@review/lib/fs-utils";
import { withFileLock } from "@review/lib/with-file-lock";
import { readReviewPackageVersion } from "@review/package-paths";
import { devReviewHome } from "@review/storage/review-home-paths";
import { reviewDesktopStateDir } from "@review/storage/review-home-paths";
import { z } from "zod";

import {
  CLAUDE_WINDOWS_MCP_ADD,
  COPILOT_WINDOWS_MCP_ADD,
  connectSetupPrompts,
  launchCommand,
  reviewMcpLaunch,
} from "./connect-prompts";
import { readRetiredFile } from "./retired-agent-hooks";
import {
  type RetirementResult,
  retireManagedTraceHooks,
} from "./retired-trace-hooks";
import {
  WINDOWS_MACHINE_ENVIRONMENT_KEY,
  updateWindowsUserPath,
  windowsCliShim,
  windowsUserPathContains,
} from "./windows-cli";

const installErrors = new Map<string, string>();

const SHIM_MARKER = "Managed by Blackboard";

function hasManagedShimMarker(source: string): boolean {
  return (
    source.includes(SHIM_MARKER) ||
    source.includes("Managed by Review Desktop") ||
    source.includes("Managed by Whiteboard")
  );
}

const PROFILE_MARKER =
  "# Managed by Review Desktop: review command PATH. Do not edit.";

const PROFILE_EXPORT = 'export PATH="$HOME/.local/bin:$PATH"';

const PROFILE_BLOCK = `\n${PROFILE_MARKER}\n${PROFILE_EXPORT}\n`;

const SHELL_PROFILE_NAMES = [".zprofile", ".bash_profile"] as const;

type ApplyResult = {
  code: number;
  output: string;
  shimPath?: string;
  userPath?: string;
};

export function cliInstallStampPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(reviewDesktopStateDir(env), "cli-install.json");
}

/**
 * Present once this build's setup is current. It sits beside the stamp, not in
 * it, because older builds parse the stamp strictly and would drop a stamp
 * carrying a new key.
 */
export function cliInstallUpdateMarkerPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(reviewDesktopStateDir(env), "cli-install-updated");
}

export function pathShimPath(homeDir = os.homedir()): string {
  return path.join(
    homeDir,
    ".local",
    "bin",
    process.platform === "win32" ? "blackboard.cmd" : "blackboard",
  );
}

export async function resolveCliInstallStatus(input: {
  packageRoot: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ReviewCliInstallStatus> {
  const homeDir = input.homeDir ?? os.homedir();
  const env = input.env ?? process.env;
  const shimPath = pathShimPath(homeDir);
  const cliPath = path.join(input.packageRoot, "dist", "cli.js");

  const [fingerprint, stamp, updated, cliBuilt, hasShim] = await Promise.all([
    installFingerprint(input.packageRoot),
    readCliInstallStamp(cliInstallStampPath(env)),
    isFile(cliInstallUpdateMarkerPath(env)),
    isFile(cliPath),
    isOwnedShim(shimPath),
  ]);

  const granted = stamp?.consent === "granted";

  const installerCommand = hasShim
    ? undefined
    : await windowsInstallerCommand(input.packageRoot, env);

  const hasCommand = hasShim || installerCommand !== undefined;

  const status: ReviewCliInstallStatus = {
    fingerprint,
    stamp,
    stale: granted && stamp.fingerprint !== fingerprint,
    updateNeeded: granted && !updated,
    shim: installerCommand ?? {
      path: shimPath,
      installed: hasShim,
      profileConfigured:
        process.platform === "win32"
          ? (hasShim &&
              stamp?.userPath !== undefined &&
              sameWindowsPath(stamp.userPath, path.dirname(shimPath))) ||
            (await windowsUserPathContains(path.dirname(shimPath)))
          : await isShellProfileConfigured(homeDir),
      onPath: pathContainsDirectory(env.PATH, path.dirname(shimPath)),
    },
    cli: cliBuilt
      ? {
          path: cliPath,
          version: readReviewPackageVersion(pathToFileURL(cliPath).href),
        }
      : null,
    connect: {
      ...reviewMcpLaunch(hasCommand),
      prompts: connectSetupPrompts(),
      plugins: connectPlugins(hasCommand),
    },
  };

  const error = installErrors.get(homeDir);

  if (error) status.error = error;

  return status;
}

/**
 * The Windows installer's "Add to PATH" task puts <install dir>\bin, which
 * holds a blackboard.cmd, on the user or machine PATH.
 */
export async function windowsInstallerCommand(
  packageRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<ReviewCliInstallStatus["shim"] | undefined> {
  if (process.platform !== "win32") return undefined;

  // packageRoot is <install dir>\resources\app\review-runtime.
  const bin = path.resolve(packageRoot, "..", "..", "..", "bin");
  const command = path.join(bin, "blackboard.cmd");

  if (!(await isOwnedShim(command))) return undefined;

  const profileConfigured =
    (await windowsUserPathContains(bin)) ||
    (await windowsUserPathContains(bin, WINDOWS_MACHINE_ENVIRONMENT_KEY));

  const onPath = pathContainsDirectory(env.PATH, bin);

  if (!profileConfigured && !onPath) return undefined;

  return {
    path: command,
    installed: true,
    profileConfigured,
    onPath,
    installer: true,
  };
}

interface ApplyCliInstallInput {
  packageRoot: string;
  shim?: boolean;
  autoUpdate?: boolean;
  cliPath?: string;
  cliRuntimePath?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}

export async function applyCliInstall(
  input: ApplyCliInstallInput,
): Promise<ApplyResult> {
  const homeDir = input.homeDir ?? os.homedir();

  try {
    const result = await withDesktopInstallLock(input.env, async () => {
      const retired = await retireInstallationHooks(input);

      const output = retired.warnings
        .map((warning) => `[skip] ${warning}\n`)
        .join("");

      if (!retired.complete) return { code: 1, output };

      if (!input.autoUpdate && input.shim !== true) return { code: 0, output };

      const result = input.autoUpdate
        ? await resyncCliInstallUnlocked(input)
        : await applyCliInstallUnlocked(input);

      return { ...result, output: output + result.output };
    });

    if (result.code === 0) installErrors.delete(homeDir);
    else installErrors.set(homeDir, result.output);

    return result;
  } catch (error) {
    const output = error instanceof Error ? error.message : String(error);
    installErrors.set(homeDir, output);

    return { code: 1, output };
  }
}

async function withDesktopInstallLock<T>(
  env: NodeJS.ProcessEnv = process.env,
  operation: () => Promise<T>,
): Promise<T> {
  const outcome = await withFileLock(
    `${cliInstallStampPath(env)}.lock`,
    { retryMs: 50, timeoutMs: 30_000, staleMs: 300_000, unownedGraceMs: 5_000 },
    operation,
  );

  if (!outcome.acquired)
    throw new Error(
      "Another Blackboard setup operation is running. Retry shortly.",
    );

  return outcome.result;
}

/**
 * Silent app-update resync: rewrites the shim for the new build. Consent is
 * re-read under the lock, so a stale UI snapshot never reinstalls a command
 * the user has since removed or declined.
 */
async function resyncCliInstallUnlocked(
  input: ApplyCliInstallInput,
): Promise<ApplyResult> {
  const env = input.env ?? process.env;
  const stamp = await readCliInstallStamp(cliInstallStampPath(env));
  const fingerprint = await installFingerprint(input.packageRoot);

  if (stamp?.consent !== "granted" || stamp.fingerprint === fingerprint)
    return { code: 0, output: "" };

  const chunks: string[] = [];
  let shimPath: string | undefined;
  let userPath = stamp.userPath;

  if (stamp.shimPath && !stamp.commandDisabled) {
    const installed = await installShim(input, chunks);

    if (installed.code !== 0) return installed;
    shimPath = installed.shimPath;
    userPath = installed.userPath ?? userPath;
  }

  const next: ReviewCliInstallStamp = {
    ...stamp,
    fingerprint,
    updatedAt: new Date().toISOString(),
  };

  if (shimPath) next.shimPath = shimPath;

  if (userPath) next.userPath = userPath;

  // The update marker stays as it was: an upgrader keeps `updateNeeded` until
  // Done.
  await writePrivateJsonAtomic(cliInstallStampPath(env), next);

  return withShimPath({ code: 0, output: chunks.join("") }, shimPath);
}

async function applyCliInstallUnlocked(
  input: ApplyCliInstallInput,
): Promise<ApplyResult> {
  const homeDir = input.homeDir ?? os.homedir();
  const env = input.env ?? process.env;
  const previous = await readCliInstallStamp(cliInstallStampPath(env));
  const granted = previous?.consent === "granted";
  const chunks: string[] = [];
  let shimPath: string | undefined;
  let userPath: string | undefined;

  if (input.shim === true) {
    const installed = await installShim(input, chunks);

    if (installed.code !== 0) return installed;
    shimPath = installed.shimPath;
    userPath = installed.userPath;
  }

  const stamp: ReviewCliInstallStamp = {
    consent: "granted",
    fingerprint: await installFingerprint(input.packageRoot),
    updatedAt: new Date().toISOString(),
  };

  const stampShimPath = shimPath ?? (granted ? previous.shimPath : undefined);

  if (stampShimPath) stamp.shimPath = stampShimPath;

  if (granted && previous.commandDisabled && input.shim !== true)
    stamp.commandDisabled = true;

  const stampUserPath =
    userPath ?? (granted && !shimPath ? previous.userPath : undefined);

  if (stampUserPath) stamp.userPath = stampUserPath;

  await writeCurrentStamp(env, stamp);

  return withShimPath({ code: 0, output: chunks.join("") }, shimPath);
}

async function installShim(
  input: ApplyCliInstallInput,
  chunks: string[],
): Promise<ApplyResult> {
  if (!input.cliPath) {
    chunks.push("This server has no built CLI to install the command from.\n");

    return { code: 1, output: chunks.join("") };
  }

  const installed = await installReviewCommand({
    cliPath: input.cliPath,
    cliRuntimePath: input.cliRuntimePath,
    homeDir: input.homeDir,
    env: input.env,
  });

  chunks.push(installed.output);

  const result: ApplyResult = {
    code: 0,
    output: "",
    shimPath: installed.shimPath,
  };

  if (installed.userPath) result.userPath = installed.userPath;

  return result;
}

function withShimPath(
  result: ApplyResult,
  shimPath: string | undefined,
): ApplyResult {
  if (shimPath) result.shimPath = shimPath;

  return result;
}

/** The published plugin or MCP install command per harness. */
function connectPlugins(
  hasShim: boolean,
): ReviewCliInstallStatus["connect"]["plugins"] {
  return {
    claude:
      process.platform === "win32"
        ? {
            label: "Add the Claude Code MCP server",
            command: CLAUDE_WINDOWS_MCP_ADD,
          }
        : {
            label: "Install the Claude Code plugin",
            command:
              "/plugin marketplace add devdotfast/whiteboard\n/plugin install blackboard@devfast",
          },
    codex: {
      label: "Install the Codex plugin",
      command:
        "codex plugin marketplace add devdotfast/whiteboard\ncodex plugin add blackboard@devfast",
    },
    opencode: {
      label: "Add the OpenCode MCP server (OpenCode 2+)",
      command: `opencode mcp add --global blackboard -- ${launchCommand(reviewMcpLaunch(hasShim))}`,
    },
    pi: {
      label: "Add the Pi MCP server (Pi 0.99+)",
      command: `pi mcp add blackboard -- ${launchCommand(reviewMcpLaunch(hasShim))}`,
    },
    omp: {
      label: "Add the oh-my-pi MCP server",
      command: `Add ${JSON.stringify({ blackboard: reviewMcpLaunch(hasShim) })}\nto "mcpServers" in ~/.omp/agent/mcp.json, then run /mcp reload.`,
    },
    copilot:
      process.platform === "win32"
        ? {
            label: "Add the Copilot CLI MCP server",
            command: COPILOT_WINDOWS_MCP_ADD,
          }
        : {
            label: "Install the Copilot CLI plugin",
            command:
              "copilot plugin marketplace add devdotfast/whiteboard\ncopilot plugin install blackboard@devfast",
          },
  };
}

/** Records setup completion. */
export async function finishCliInstallUpdate(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await withDesktopInstallLock(env, async () => {
    const stamp = await readCliInstallStamp(cliInstallStampPath(env));

    if (stamp?.consent !== "granted") return;
    await writeUpdateMarker(env);
  });
}

export async function declineCliInstall(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await withDesktopInstallLock(env, () =>
    writeCurrentStamp(env, {
      consent: "declined",
      updatedAt: new Date().toISOString(),
    }),
  );
}

export async function skipCliInstall(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await withDesktopInstallLock(env, async () => {
    const stampPath = cliInstallStampPath(env);

    if (await readCliInstallStamp(stampPath)) return;
    await writeCurrentStamp(env, {
      consent: "skipped",
      updatedAt: new Date().toISOString(),
    });
  });
}

/** Removes the stamp entirely, so the next app launch prompts again. */
export async function resetCliInstall(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await withDesktopInstallLock(env, async () => {
    await rm(cliInstallStampPath(env), { force: true });
    await rm(cliInstallUpdateMarkerPath(env), { force: true });
  });
}

/** Writes a stamp this build decided, which also makes the setup current. */
async function writeCurrentStamp(
  env: NodeJS.ProcessEnv,
  stamp: ReviewCliInstallStamp,
): Promise<void> {
  await writePrivateJsonAtomic(cliInstallStampPath(env), stamp);
  await writeUpdateMarker(env);
}

async function writeUpdateMarker(env: NodeJS.ProcessEnv): Promise<void> {
  await writeFileAtomicAsync(cliInstallUpdateMarkerPath(env), "", {
    encoding: "utf8",
    mode: 0o600,
  });
}

interface RemoveCliInstallInput {
  shim?: boolean;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}

export async function removeCliInstall(
  input: RemoveCliInstallInput,
): Promise<{ output: string }> {
  return withDesktopInstallLock(input.env, () =>
    removeCliInstallUnlocked(input),
  );
}

async function removeCliInstallUnlocked(
  input: RemoveCliInstallInput,
): Promise<{ output: string }> {
  const homeDir = input.homeDir ?? os.homedir();
  const env = input.env ?? process.env;
  const chunks: string[] = [];

  const retired = await retireInstallationHooks(input);
  chunks.push(...retired.warnings.map((warning) => `[skip] ${warning}\n`));

  if (!retired.complete) throw new Error(chunks.join(""));

  const previous = await readCliInstallStamp(cliInstallStampPath(env));

  if (input.shim) {
    const shimPath = pathShimPath(homeDir);
    // Only ever delete a command file this app wrote; a hand-made file at
    // the same path stays untouched.
    const contents = await readTextIfExists(shimPath);

    if (hasManagedShimMarker(contents)) {
      await rm(shimPath, { force: true });

      if (process.platform === "win32") {
        const bashShim = shimPath.replace(/\.cmd$/i, "");

        if (await isOwnedShim(bashShim)) await rm(bashShim, { force: true });
      }

      chunks.push(`[ok] removed blackboard command ${shimPath}\n`);
    } else if (contents) {
      chunks.push(
        `${shimPath} was not installed by Blackboard Desktop; left in place.\n`,
      );
    }

    for (const profilePath of await removeShellProfilePath(homeDir)) {
      chunks.push(`[ok] removed Blackboard PATH entry from ${profilePath}\n`);
    }
  }

  if (previous?.consent === "granted") {
    const stamp: ReviewCliInstallStamp = {
      consent: "granted",
      updatedAt: new Date().toISOString(),
    };

    if (previous.fingerprint) stamp.fingerprint = previous.fingerprint;

    if (!input.shim && previous.shimPath) stamp.shimPath = previous.shimPath;

    if (input.shim || previous.commandDisabled) stamp.commandDisabled = true;

    if (!input.shim && previous.userPath) stamp.userPath = previous.userPath;
    await writeCurrentStamp(env, stamp);
  }

  return { output: chunks.join("") };
}

/**
 * Fingerprint of the package manifest and built CLI. Content-based so it
 * works identically in a dev checkout and a packaged review-runtime, with no
 * build-time stamping.
 */
export async function installFingerprint(packageRoot: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readTextIfExists(path.join(packageRoot, "package.json")));
  hash.update("dist/cli.js\0");
  hash.update(await readTextIfExists(path.join(packageRoot, "dist", "cli.js")));

  return hash.digest("hex").slice(0, 20);
}

export async function readCliInstallStamp(
  stampPath: string,
): Promise<ReviewCliInstallStamp | null> {
  let value: unknown;

  try {
    value = JSON.parse(await readFile(stampPath, "utf8"));
  } catch {
    return null;
  }

  const parsed = ReviewCliInstallStampSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

export async function isOwnedShim(shimPath: string): Promise<boolean> {
  return hasManagedShimMarker(await readTextIfExists(shimPath));
}

/**
 * The shim is POSIX sh, so running `review` needs no Node.js at all to start.
 * It prefers the CLI and runtime the running Blackboard Desktop advertises in its
 * discovery file, falls back to the paths baked in by the app that wrote it,
 * and runs the CLI under the app's Bun runtime, matching the server.
 * A system Bun is the fallback when the app runtime is unavailable.
 */
export async function writePathShim(
  shimPath: string,
  cliPath: string,
  runtimePath: string | undefined,
  devHome: string,
): Promise<void> {
  if (process.platform === "win32") {
    await writeFileAtomicAsync(
      shimPath,
      windowsCliShim(cliPath, runtimePath ?? process.execPath, devHome),
      { replaceSymlink: true },
    );

    // Git Bash and agent plugins use the POSIX launcher beside the .cmd file.
    shimPath = shimPath.replace(/\.cmd$/i, "");
  }

  const source = `#!/bin/sh
# Managed by Blackboard Desktop ("Blackboard: Install CLI in PATH"). Do not edit.
FALLBACK_CLI=${shSingleQuote(cliPath)}
FALLBACK_RUNTIME=${shSingleQuote(runtimePath ?? "")}
DEFAULT_HOME=${shSingleQuote(devHome)}
export DEV_REVIEW_HOME="\${DEV_REVIEW_HOME:-$DEFAULT_HOME}"
DESKTOP="$DEV_REVIEW_HOME/review-desktop"

# A record counts only while its server process is alive.
live() {
  [ -f "$1" ] || return 1
  pid=$(sed -n 's/.*"serverPid"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$1" | head -n 1)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# Same order as the CLI: DEV_REVIEW_INSTANCE, the machine default, the only
# live Desktop, then stable. A stable Desktop that predates instances wrote
# only server.json; it never stands in for any other key.
LEGACY="$DESKTOP/server.json"
STABLE="$DESKTOP/instances/stable.json"
[ -f "$STABLE" ] || STABLE="$LEGACY"
key="\${DEV_REVIEW_INSTANCE:-}"
if [ -z "$key" ] && [ -f "$DESKTOP/default-instance" ]; then
  key=$(head -n 1 "$DESKTOP/default-instance" | tr -d '[:space:]')
fi
DISCOVERY=""
case "$key" in
  # Keys name files; the CLI rejects anything else.
  *[!A-Za-z0-9_.-]*) ;;
  stable) DISCOVERY="$STABLE" ;;
  ?*) DISCOVERY="$DESKTOP/instances/$key.json" ;;
  *)
    for record in "$DESKTOP"/instances/*.json "$LEGACY"; do
      if [ "$record" = "$LEGACY" ] && [ "$STABLE" != "$LEGACY" ]; then continue; fi
      if live "$record"; then
        if [ -n "$DISCOVERY" ]; then DISCOVERY=""; break; fi
        DISCOVERY="$record"
      fi
    done
    [ -n "$DISCOVERY" ] || DISCOVERY="$STABLE"
    ;;
esac

cli=""
runtime=""
delegated=""
manage_instances=""
for arg in "$@"; do
  if [ "$arg" = "instances" ]; then manage_instances=1; break; fi
done
if [ -z "$manage_instances" ] && [ -z "\${DEV_FAST_REVIEW_CLI_NO_DELEGATE:-}" ] && live "$DISCOVERY"; then
  cli=$(sed -n 's/.*"cliPath"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$DISCOVERY" | head -n 1)
  delegated="1"
  runtime=$(sed -n 's/.*"cliRuntimePath"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$DISCOVERY" | head -n 1)
fi
if [ -z "$cli" ] || [ ! -f "$cli" ] || { [ -n "$runtime" ] && [ ! -x "$runtime" ]; }; then
  delegated=""
  cli="$FALLBACK_CLI"
  runtime="$FALLBACK_RUNTIME"
fi

if [ ! -f "$cli" ]; then
  echo "Blackboard CLI not found at $cli. Start Blackboard Desktop, or run npx @blackboard/review instead." >&2
  exit 1
fi

# Prevent bootstrap from overriding this selection.
export DEV_FAST_REVIEW_CLI_NO_DELEGATE=1
export DEV_FAST_REVIEW_CLI_DELEGATED="$delegated"

# Use the selected app's runtime so the CLI and server stay in sync.
if [ -n "$runtime" ] && [ -x "$runtime" ]; then
  # Older desktops advertise Electron; Bun ignores this compatibility flag.
  export ELECTRON_RUN_AS_NODE=1
  exec "$runtime" "$cli" "$@"
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Blackboard needs Bun 1.4.2 or newer. Install Bun, or install Blackboard Desktop." >&2
  exit 1
fi
exec bun "$cli" "$@"
`;

  await writeFileAtomicAsync(shimPath, source, {
    encoding: "utf8",
    mode: 0o755,
    replaceSymlink: true,
  });
  await chmod(shimPath, 0o755);
}

export async function installReviewCommand(input: {
  cliPath: string;
  cliRuntimePath?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ shimPath: string; output: string; userPath?: string }> {
  const retired = await retireInstallationHooks({
    ...input,
    packageRoot: path.resolve(input.cliPath, "..", ".."),
  });

  if (!retired.complete) throw new Error(retired.warnings.join("\n"));
  const homeDir = input.homeDir ?? os.homedir();
  const env = input.env ?? process.env;
  const shimPath = pathShimPath(homeDir);

  if ((await isFile(shimPath)) && !(await isOwnedShim(shimPath))) {
    return {
      shimPath,
      output: `[skip] kept the existing blackboard command at ${shimPath}\n`,
    };
  }

  const shadowingCommand = await resolvePathCommand(
    "blackboard",
    shimPath,
    env,
  );

  await writePathShim(
    shimPath,
    input.cliPath,
    input.cliRuntimePath,
    devReviewHome(env, homeDir),
  );

  const legacyShim = path.join(path.dirname(shimPath), "review");

  if (await isOwnedShim(legacyShim)) await rm(legacyShim, { force: true });
  const profileOutput = await ensureShellProfilePath({ homeDir, env });

  const shadowingOutput = shadowingCommand
    ? `Warning: ${shadowingCommand} currently shadows ${shimPath}. Remove that PATH entry or put ${path.dirname(shimPath)} before it.\n`
    : "";

  const output = `[ok] blackboard command -> ${shimPath}\n${profileOutput}${shadowingOutput}`;

  // ensureShellProfilePath throws when the Windows PATH write fails, so
  // reaching here means new terminals will find the command.
  return process.platform === "win32"
    ? { shimPath, output, userPath: path.dirname(shimPath) }
    : { shimPath, output };
}

export async function ensureShellProfilePath(input: {
  homeDir: string;
  env: NodeJS.ProcessEnv;
}): Promise<string> {
  const shimDirectory = path.dirname(pathShimPath(input.homeDir));

  if (pathContainsDirectory(input.env.PATH, shimDirectory)) return "";

  if (process.platform === "win32") {
    await updateWindowsUserPath(shimDirectory);

    return `[ok] added ${shimDirectory} to your user PATH; open a new terminal\n`;
  }

  const shell = path.basename(input.env.SHELL?.trim() ?? "");
  let profileName: (typeof SHELL_PROFILE_NAMES)[number] | undefined;

  if (shell === "bash") {
    profileName = ".bash_profile";
  } else if (
    shell === "zsh" ||
    (shell !== "fish" && process.platform === "darwin")
  ) {
    profileName = ".zprofile";
  }

  if (!profileName) {
    return "Blackboard did not update PATH for this shell. Add ~/.local/bin to PATH. Fish users can run: fish_add_path ~/.local/bin\n";
  }

  const profilePath = path.join(input.homeDir, profileName);
  const source = await readTextIfExists(profilePath);

  if (source.includes(PROFILE_MARKER) || source.includes(".local/bin")) {
    return "";
  }

  await writeTextAtomic(profilePath, `${source}${PROFILE_BLOCK}`);

  return `[ok] added ${shimDirectory} to PATH in ${profilePath}\n`;
}

export async function removeShellProfilePath(
  homeDir: string,
): Promise<string[]> {
  if (process.platform === "win32") {
    await updateWindowsUserPath(path.dirname(pathShimPath(homeDir)), true);

    return ["user PATH"];
  }

  const removed: string[] = [];

  for (const profileName of SHELL_PROFILE_NAMES) {
    const profilePath = path.join(homeDir, profileName);
    const source = await readTextIfExists(profilePath);

    if (!source.includes(PROFILE_BLOCK)) continue;
    await writeTextAtomic(profilePath, source.replaceAll(PROFILE_BLOCK, ""));
    removed.push(profilePath);
  }

  return removed;
}

function shSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function resolvePathCommand(
  command: string,
  shimPath: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const entries = (env.PATH ?? "").split(path.delimiter);
  const shimDirectory = path.resolve(path.dirname(shimPath));

  const shimIndex = entries.findIndex(
    (entry) => path.resolve(entry || ".") === shimDirectory,
  );

  for (let index = 0; index < entries.length; index += 1) {
    const candidate = path.join(entries[index] || ".", command);

    if (!(await isExecutableFile(candidate))) continue;

    if ((await readTextIfExists(candidate)).includes(SHIM_MARKER)) {
      return undefined;
    }

    return shimIndex === -1 || index < shimIndex
      ? path.resolve(candidate)
      : undefined;
  }

  return undefined;
}

function sameWindowsPath(left: string, right: string): boolean {
  return (
    path.win32.resolve(left).toLowerCase() ===
    path.win32.resolve(right).toLowerCase()
  );
}

function pathContainsDirectory(
  pathValue: string | undefined,
  directory: string,
): boolean {
  return (pathValue ?? "")
    .split(path.delimiter)
    .some(
      (entry) =>
        entry.length > 0 && path.resolve(entry) === path.resolve(directory),
    );
}

async function isShellProfileConfigured(homeDir: string): Promise<boolean> {
  const profiles = await Promise.all(
    SHELL_PROFILE_NAMES.map((profileName) =>
      readTextIfExists(path.join(homeDir, profileName)),
    ),
  );

  return profiles.some((source) => source.includes(PROFILE_MARKER));
}

async function writeTextAtomic(
  filePath: string,
  source: string,
): Promise<void> {
  let mode = 0o644;

  try {
    mode = (await stat(filePath)).mode & 0o777;
  } catch {
    // Use the default profile mode for a new file.
  }

  await writeFileAtomicAsync(filePath, source, { encoding: "utf8", mode });
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function isExecutableFile(target: string): Promise<boolean> {
  if (!(await isFile(target))) return false;

  try {
    await access(target, constants.X_OK);

    return true;
  } catch {
    return false;
  }
}

async function retireInstallationHooks(input: {
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
}): Promise<RetirementResult> {
  const homeDir = input.homeDir ?? os.homedir();
  const env = input.env ?? process.env;
  const source = await readRetiredFile(cliInstallStampPath(env));

  const stamp =
    source === null
      ? null
      : z.object({ shimPath: z.string().optional() }).parse(JSON.parse(source));

  const stamped = stamp?.shimPath;

  const candidates = [
    pathShimPath(homeDir),
    path.join(homeDir, ".local/bin/blackboard.cmd"),
    path.join(homeDir, ".local/bin/review"),
    path.join(homeDir, ".local/bin/whiteboard"),
    ...(stamped ? [stamped] : []),
    ...(input.packageRoot
      ? [
          path.resolve(
            input.packageRoot,
            "..",
            "..",
            "..",
            "bin/blackboard.cmd",
          ),
        ]
      : []),
  ];

  const ownedCommands: string[] = [];

  for (const file of candidates) {
    if (!path.isAbsolute(file)) continue;
    const content = await readRetiredFile(file);

    if (content === null ? file === stamped : hasManagedShimMarker(content))
      ownedCommands.push(file);

    if (file.endsWith(".cmd")) {
      const companion = file.slice(0, -4);

      if (await isOwnedShim(companion)) ownedCommands.push(companion);
    }
  }

  return retireManagedTraceHooks({ homeDir, env, ownedCommands });
}
