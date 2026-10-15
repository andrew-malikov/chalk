import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, realpath, rm } from "node:fs/promises";

import { createReviewApi } from "@chalk/server/review-api/http.js";
import {
  createReviewServerApp,
  relayReviewCallbacks,
} from "@chalk/server/review-server-core.js";
import { migrateDiffrConfig } from "@review/node/diffr-config";
import { writePrivateJsonAtomic } from "@review/node/lib/atomic-write";
import { withFileLock } from "@review/node/lib/with-file-lock";
import { openReviewProfile } from "@review/node/review-api/profile.js";
import {
  type ReviewServerDiscovery,
  headlessServerLockPath,
  reviewServerDiscoveryPath,
} from "@review/node/server-discovery.js";

import { GlobalReviewDesktopVerbRelay } from "./global-verb-relay.js";

interface HeadlessServerInput {
  stateDir: string;
  port?: number;
  softwareMapEnabled?: boolean;
  signal: AbortSignal;
  onReady(discovery: ReviewServerDiscovery): void;
}

/** One foreground headless endpoint per profile; Desktop shares its database. */
export async function runHeadlessServer(input: HeadlessServerInput) {
  await mkdir(input.stateDir, { recursive: true, mode: 0o700 });
  const stateDir = await realpath(input.stateDir);

  const outcome = await withHeadlessServerLock(stateDir, () =>
    serve({ ...input, stateDir }),
  );

  if (!outcome.acquired)
    throw new Error(
      `A Chalk server already owns ${stateDir}. Stop it first, or choose another --state-dir.`,
    );
}

/** Held by a running server, so also by anything that must not run beside one. */
export function withHeadlessServerLock<T>(
  stateDir: string,
  operation: () => Promise<T>,
) {
  return withFileLock(
    headlessServerLockPath(stateDir),
    {
      timeoutMs: 0,
      retryMs: 20,
      // A paused live owner must never lose exclusive access to its store.
      staleMs: Infinity,
      unownedGraceMs: 1_000,
      // A reboot or kill can hand the pid to an unrelated live process.
      identifyOwner: true,
    },
    operation,
  );
}

async function serve(input: HeadlessServerInput) {
  if (input.signal.aborted) return;

  await migrateDiffrConfig(input.signal);

  const local = await openReviewProfile(input.stateDir, {
    manageWorkspaces: false,
  });

  const discovery: ReviewServerDiscovery = {
    version: 1,
    instanceId: randomUUID(),
    url: "http://127.0.0.1:0",
    serverPid: process.pid,
    token: randomBytes(32).toString("base64url"),
  };

  const relay = new GlobalReviewDesktopVerbRelay();

  const app = createReviewServerApp({
    token: discovery.token,
    instanceId: discovery.instanceId,
    serverId: local.store.serverId(),
    relay,
  });

  const callbacks = relayReviewCallbacks(relay, input.softwareMapEnabled);

  const api = createReviewApi(
    local.store,
    local.data,
    callbacks.open,
    callbacks.capabilities,
    // The scratchpad is the laptop's alone, even with a Desktop attached.
    () => false,
    () => ({ key: "headless", home: input.stateDir }),
  );

  app.route("/reviews-api", api);

  let server: Bun.Server<undefined> | undefined;
  let published = false;

  try {
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: input.port ?? 0,
      fetch: app.fetch,
      idleTimeout: 0,
      maxRequestBodySize: 64 * 1024 * 1024,
    });
    discovery.url = `http://127.0.0.1:${server.port}`;
    await writePrivateJsonAtomic(
      reviewServerDiscoveryPath(input.stateDir),
      discovery,
    );
    published = true;
    input.onReady(discovery);

    await new Promise<void>((resolve) => {
      if (input.signal.aborted) resolve();
      else
        input.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  } finally {
    try {
      if (published)
        await rm(reviewServerDiscoveryPath(input.stateDir), { force: true });
    } finally {
      // An attached Desktop's stream would otherwise hold the close open.
      relay.close();
      await server?.stop(true);

      try {
        await local.data.close();
      } finally {
        await local.store.close();
      }
    }
  }
}
