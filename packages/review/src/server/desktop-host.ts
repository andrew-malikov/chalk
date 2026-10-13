#!/usr/bin/env bun

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { findReviewPackageRoot } from "@review/package-paths";
import { openReviewProfile } from "@review/review-api/profile";
import { reviewInstanceIdentity } from "@review/server/desktop-discovery";
import { devReviewHome } from "@review/storage/review-home-paths";

import { listenForDesktopHostShutdown } from "./desktop-host-shutdown";
import { createGlobalReviewServer } from "./desktop-server";

export async function runDesktopHost(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // Port 0 lets the OS choose; the ready event below reports what was bound.
  const port = requiredPort(env.DEV_FAST_REVIEW_SERVER_PORT);

  const appPid = requiredPositiveInteger(
    env.DEV_FAST_REVIEW_APP_PID,
    "DEV_FAST_REVIEW_APP_PID",
  );

  const packageRoot = findReviewPackageRoot(import.meta.url);
  const toolingRoot = env.DEV_FAST_REVIEW_TOOLING_ROOT || packageRoot;

  const serverInput = {
    appPid,
    packageRoot,
    toolingRoot,
    port,
    token: env.DEV_FAST_REVIEW_SERVER_TOKEN,
    instanceId: env.DEV_FAST_REVIEW_INSTANCE_ID,
    identity: reviewInstanceIdentity(env),
  };

  const home = devReviewHome(env);
  await mkdir(home, { recursive: true });

  const local = await openReviewProfile(home, { manageWorkspaces: true });

  // JSON is the sole user-review store. A failure is surfaced, never replaced
  // by a second catalog or an old document renderer.

  const server = createGlobalReviewServer({
    ...serverInput,
    reviewStore: local.store,
    reviewData: local.data,
    cliRuntimePath: env.DEV_FAST_REVIEW_CLI_RUNTIME,
  });

  try {
    await server.listen();
  } catch (error) {
    await local?.data.close();
    await local?.store.close();
    throw error;
  }

  process.stdout.write(
    `${JSON.stringify({ event: "ready", ...server.discovery })}\n`,
  );

  let stopping: Promise<void> | null = null;

  const stop = () => {
    if (!stopping) {
      stopping = server
        .close("app-exit")
        .finally(() => local?.data.close())
        .finally(() => local?.store.close());
    }

    return stopping;
  };

  listenForDesktopHostShutdown(process, () => {
    void stop().then(() => process.exit(0));
  });
  process.once("SIGINT", () => {
    void stop().then(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void stop().then(() => process.exit(0));
  });
}

function requiredPort(value: string | undefined): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(
      "DEV_FAST_REVIEW_SERVER_PORT must be a port between 0 and 65535.",
    );
  }

  return parsed;
}

function requiredPositiveInteger(
  value: string | undefined,
  name: string,
): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

if (process.env.DEV_FAST_REVIEW_DESKTOP_HOST_AUTOSTART !== "0") {
  void runDesktopHost().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
