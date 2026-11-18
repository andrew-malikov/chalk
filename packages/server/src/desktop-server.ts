import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { jsonString } from "@chalk/json";
import {
  type JsonValue,
  REVIEW_DESKTOP_DISCOVERY_VERSION,
  type ReviewDesktopDiscovery,
  isJsonObject,
  reviewDiffrSummarizerInputSchema,
} from "@chalk/review-contracts";
import { createReviewApi } from "@chalk/server/review-api/http.js";
import {
  createReviewServerApp,
  relayReviewCallbacks,
  serverJson,
} from "@chalk/server/review-server-core";
import { type ReviewInstanceIdentity } from "@review/node/desktop-discovery";
import {
  migrateDiffrConfig,
  readDiffrConfig,
  saveDiffrSummarizer,
  setDiffrConfigValue,
  testDiffrSummarizer,
} from "@review/node/diffr-config";
import { writePrivateJsonAtomic } from "@review/node/lib/atomic-write";
import { readPackageVersion } from "@review/node/package-paths";
import type { LocalReviewData } from "@review/node/review-api/local-data.js";
import type { ReviewStore } from "@review/node/review-api/store.js";
import {
  chalkHome,
  reviewInstanceDiscoveryPath,
  reviewLegacyDiscoveryPath,
} from "@review/node/storage/chalk-paths";
import type { Hono } from "hono";
import { z } from "zod";

import {
  GlobalReviewDesktopVerbRelay,
  type ReviewDesktopVerbRelay,
} from "./global-verb-relay";
import { type ReviewHonoEnv, readBoundedRequestJson } from "./hono-http";
import { ReviewServerError } from "./http-json";

export interface GlobalReviewServerInput {
  /** The desktop host owns this shared database and closes it after the server. */
  reviewStore: ReviewStore;
  reviewData: LocalReviewData;
  appPid: number;
  packageRoot: string;
  cliPackageRoot?: string;
  toolingRoot: string;
  cliRuntimePath?: string;
  port: number;
  token?: string;
  instanceId?: string;
  identity?: ReviewInstanceIdentity;
  discoveryPath?: string;
  relay?: ReviewDesktopVerbRelay;
  mountDesktopRoutes?(
    app: Hono<ReviewHonoEnv>,
    discovery: ReviewDesktopDiscovery,
  ): void;
}

export interface GlobalReviewServer {
  readonly discovery: ReviewDesktopDiscovery;
  readonly url: string;
  listen(): Promise<void>;
  close(reason?: "app-exit"): Promise<void>;
}

export function createGlobalReviewServer(
  input: GlobalReviewServerInput,
): GlobalReviewServer {
  const instanceId = input.instanceId ?? crypto.randomUUID();
  const token = input.token ?? crypto.randomBytes(32).toString("base64url");
  // Port 0 asks the OS to choose, so nothing may assume the requested port is
  // the bound one until listen() has resolved.
  let boundPort = input.port;
  const urlForBoundPort = () => `http://127.0.0.1:${boundPort}`;
  const identity = input.identity ?? { key: "stable", channel: "stable" };

  // Stable also writes the pre-instance server.json, so a CLI or shim that
  // predates instances still finds it.
  const discoveryPaths = input.discoveryPath
    ? [input.discoveryPath]
    : identity.key === "stable"
      ? [reviewInstanceDiscoveryPath("stable"), reviewLegacyDiscoveryPath()]
      : [reviewInstanceDiscoveryPath(identity.key)];

  // Each window attaches its own stream; one at a time keeps a verb from
  // opening in every window, and the next takes over when it goes.
  const relay =
    input.relay ?? new GlobalReviewDesktopVerbRelay({ maxClients: 1 });

  const reviewStore = input.reviewStore;

  let closing = false;
  const cliPackageRoot = input.cliPackageRoot ?? input.packageRoot;
  const cliPath = path.join(cliPackageRoot, "dist", "cli.js");

  const discovery: ReviewDesktopDiscovery = {
    version: REVIEW_DESKTOP_DISCOVERY_VERSION,
    instanceId,
    url: urlForBoundPort(),
    appPid: input.appPid,
    serverPid: process.pid,
    token,
    startedAt: Date.now(),
    ...identity,
  };

  // A source-run dev server has no built CLI to advertise.
  if (existsSync(cliPath)) {
    discovery.cliPath = cliPath;
    discovery.cliVersion = readPackageVersion(pathToFileURL(cliPath).href);

    if (input.cliRuntimePath && existsSync(input.cliRuntimePath)) {
      discovery.cliRuntimePath = input.cliRuntimePath;
    }
  }

  const app = createReviewServerApp({
    token,
    instanceId,
    serverId: input.reviewStore.serverId(),
    relay,
  });

  const callbacks = relayReviewCallbacks(relay);

  app.route(
    "/reviews-api",
    createReviewApi(
      input.reviewStore,
      input.reviewData,
      callbacks.open,
      callbacks.capabilities,
      () => {
        const { key, channel, checkout, appVersion, cliVersion, instanceId } =
          discovery;

        return {
          key: key ?? null,
          channel: channel ?? null,
          checkout: checkout ?? null,
          appVersion: appVersion ?? null,
          cliVersion: cliVersion ?? null,
          instanceId,
          url: urlForBoundPort(),
          home: chalkHome(),
        };
      },
    ),
  );
  app.post("/app/focus", async () => {
    const result = await relay.dispatch({
      name: "focusWindow",
      args: {},
    });

    return serverJson(result.ok ? 200 : 409, result);
  });
  app.get("/diffr-config", async () =>
    serverJson(200, await readDiffrConfig()),
  );
  app.put("/diffr-config", async (context) => {
    const body = await readBoundedRequestJson(context.req.raw);

    const key = isJsonObject(body) ? jsonString(body.key) : undefined;

    const value = isJsonObject(body) ? body.value : undefined;

    if (key === undefined || value === undefined) {
      throw new ReviewServerError("key and value are required.", 400);
    }

    return serverJson(200, await setDiffrConfigValue(key, value));
  });
  app.put("/diffr-config/summarizer", async (context) => {
    const input = reviewDiffrSummarizerInputSchema.safeParse(
      await readBoundedRequestJson(context.req.raw),
    );

    if (!input.success)
      throw new ReviewServerError("Invalid summary settings.", 400);

    return serverJson(200, await saveDiffrSummarizer(input.data));
  });
  app.post("/diffr-config/summarizer/test", async (context) => {
    const input = reviewDiffrSummarizerInputSchema.safeParse(
      await readBoundedRequestJson(context.req.raw),
    );

    if (!input.success)
      throw new ReviewServerError("Invalid summary settings.", 400);

    return serverJson(200, {
      summary: await testDiffrSummarizer(
        input.data,
        undefined,
        context.req.raw.signal,
      ),
    });
  });
  input.mountDesktopRoutes?.(app, discovery);

  let httpServer: Bun.Server<undefined> | undefined;

  return {
    discovery,
    get url() {
      return urlForBoundPort();
    },
    listen: async () => {
      await migrateDiffrConfig();
      httpServer = Bun.serve({
        hostname: "127.0.0.1",
        port: input.port,
        fetch: app.fetch,
        idleTimeout: 0,
        maxRequestBodySize: 64 * 1024 * 1024,
      });
      boundPort = httpServer.port!;
      discovery.url = urlForBoundPort();

      for (const discoveryPath of discoveryPaths)
        await writePrivateJsonAtomic(discoveryPath, discovery);
    },
    close: async () => {
      if (closing) return;
      closing = true;

      for (const discoveryPath of discoveryPaths)
        await removeMatchingDiscovery(discoveryPath, discovery);
      relay.close();

      await httpServer?.stop(true);
    },
  };
}

async function removeMatchingDiscovery(
  filePath: string,
  discovery: ReviewDesktopDiscovery,
): Promise<void> {
  try {
    const current: JsonValue = JSON.parse(await readFile(filePath, "utf8"));

    if (
      isJsonObject(current) &&
      current.instanceId === discovery.instanceId &&
      current.appPid === discovery.appPid
    ) {
      await rm(filePath, { force: true });
    }
  } catch (error) {
    // SAFETY: fs/promises rejects with a Node ErrnoException carrying `code`.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
