import { execFile, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  type ReviewDesktopDiscovery,
  ReviewDesktopDiscoverySchema,
} from "@chalk/review-contracts";

export interface ServerOptions {
  runtimePath: string;
  entry: string;
  /** Absent for installed builds, which run as the stable instance. */
  checkout?: string;
  appVersion: string;
  profile: string;
  key: string;
  env?: NodeJS.ProcessEnv;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  signal?: AbortSignal;
  onState?(state: {
    status: "starting" | "error" | "disconnected";
    message: string;
  }): void;
}

async function desktopEnvironment(env: NodeJS.ProcessEnv) {
  if (process.platform !== "darwin") return env;

  // Finder launches without the user's shell PATH. Read only PATH so app
  // identity and credentials remain those of the parent process.
  try {
    const { stdout } = await promisify(execFile)(
      env.SHELL || "/bin/zsh",
      ["-ilc", 'printf "\\0%s\\0" "$PATH"'],
      { env, cwd: env.HOME, timeout: 3000, maxBuffer: 1024 * 1024 },
    );

    // Shell startup files may print messages before the delimited value.
    const shellPath = stdout.split("\0")[1];

    if (shellPath)
      return {
        ...env,
        PATH: [...new Set([shellPath, env.PATH ?? ""].join(":").split(":"))]
          .filter(Boolean)
          .join(":"),
      };
  } catch {
    // Broken or blocking shell configuration must not prevent app startup.
  }

  return env;
}

export async function startServer(
  options: ServerOptions,
): Promise<{ discovery: ReviewDesktopDiscovery; stop(): Promise<void> }> {
  if (options.signal?.aborted)
    throw new Error("Review server startup cancelled.");

  const discoveryFile = path.join(
    options.profile,
    "review-desktop/instances",
    `${options.key}.json`,
  );

  async function readRecord() {
    try {
      return ReviewDesktopDiscoverySchema.parse(
        JSON.parse(await readFile(discoveryFile, "utf8")),
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return null;
      throw error;
    }
  }

  await mkdir(options.profile, { recursive: true, mode: 0o700 });
  const previous = await readRecord();

  if (previous) {
    let occupied = false;

    try {
      const response = await fetch(`${previous.url}/health`, {
        headers: { "x-review-token": previous.token },
        redirect: "error",
        signal: AbortSignal.timeout(1500),
      });

      const health = await response.json();
      occupied =
        response.ok &&
        health.ok === true &&
        health.instanceId === previous.instanceId &&
        health.serverPid === previous.serverPid;
    } catch {
      /* A stale discovery record does not occupy the profile. */
    }

    if (occupied)
      throw new Error(
        "Review is already running with this profile and instance key.",
      );
  }

  const token = randomBytes(32).toString("hex");
  const instanceId = randomUUID();
  const env = await desktopEnvironment({ ...process.env, ...options.env });

  if (options.signal?.aborted)
    throw new Error("Review server startup cancelled.");

  const child = spawn(options.runtimePath, [options.entry], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...env,
      DEV_REVIEW_HOME: options.profile,
      ...(options.checkout && {
        CHALK_REVIEW_CHECKOUT: options.checkout,
        CHALK_REVIEW_INSTANCE_KEY: options.key,
        CHALK_REVIEW_CLI_ROOT: path.join(options.checkout, "packages/cli"),
      }),
      CHALK_REVIEW_SERVER_PORT: "0",
      CHALK_REVIEW_APP_PID: String(process.pid),
      CHALK_REVIEW_SERVER_TOKEN: token,
      CHALK_REVIEW_INSTANCE_ID: instanceId,
      CHALK_REVIEW_DESKTOP_HOST_AUTOSTART: "1",
      CHALK_REVIEW_CLI_RUNTIME: options.runtimePath,
      CHALK_REVIEW_RELEASE_CHANNEL: options.checkout ? "dev" : "stable",
      CHALK_REVIEW_APP_VERSION: options.appVersion,
    },
  });

  let stopping = false;
  let ready = false;
  let stderr = "";

  const exited = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );

  let stopPromise: Promise<void> | undefined;

  function stop() {
    stopping = true;

    return (stopPromise ??= (async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");

        const timer = setTimeout(
          () => child.kill("SIGKILL"),
          options.shutdownTimeoutMs ?? 5000,
        );

        await exited;
        clearTimeout(timer);
      }

      const record = await readRecord();

      if (record?.instanceId === instanceId)
        await rm(discoveryFile, { force: true });
    })());
  }

  let abortListener: (() => void) | undefined;

  try {
    const discovery = await new Promise<ReviewDesktopDiscovery>(
      (resolve, reject) => {
        let pending = "";

        const timer = setTimeout(
          () => reject(new Error("Review server startup timed out.")),
          options.startupTimeoutMs ?? 120000,
        );

        function fail(error: Error) {
          clearTimeout(timer);
          reject(error);
        }

        abortListener = () =>
          fail(new Error("Review server startup cancelled."));
        options.signal?.addEventListener("abort", abortListener, {
          once: true,
        });
        child.once("error", (error) =>
          fail(new Error(`Cannot start Bun sidecar: ${error.message}`)),
        );
        child.once("exit", (code, signal) => {
          const message =
            `Review server exited (${signal ?? code}). ${stderr}`.trim();

          if (!ready) fail(new Error(message));
          else if (!stopping)
            options.onState?.({ status: "disconnected", message });
        });
        child.stderr!.on("data", (chunk) => {
          stderr = (stderr + String(chunk)).slice(-8000);
        });
        child.stdout!.on("data", (chunk) => {
          if (ready) return;
          pending += String(chunk);

          if (pending.length > 1024 * 1024) {
            fail(new Error("Review startup output exceeded its limit."));

            return;
          }

          let end: number;

          while ((end = pending.indexOf("\n")) !== -1) {
            const line = pending.slice(0, end);
            pending = pending.slice(end + 1);

            if (!line.trim()) continue;

            try {
              const value = JSON.parse(line);

              if (value.event === "ready") {
                const result = ReviewDesktopDiscoverySchema.parse(value);

                if (
                  result.token !== token ||
                  result.instanceId !== instanceId ||
                  result.serverPid !== child.pid ||
                  result.appPid !== process.pid ||
                  result.key !== options.key
                )
                  throw new Error("Ready identity mismatch.");
                ready = true;
                clearTimeout(timer);
                resolve(result);

                return;
              }
            } catch {
              fail(new Error("Invalid Review server ready/startup payload."));

              return;
            }
          }
        });
      },
    );

    return { discovery, stop };
  } catch (error) {
    await stop();
    options.onState?.({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (abortListener)
      options.signal?.removeEventListener("abort", abortListener);
  }
}
