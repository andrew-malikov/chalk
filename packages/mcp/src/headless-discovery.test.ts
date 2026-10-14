import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runHeadlessServer } from "@chalk/server/headless-host.js";
import {
  type ReviewServerDiscovery,
  reviewServerDiscoveryPath,
} from "@review/node/server-discovery.js";
import { expect, it } from "vitest";

import { connectReviewApi } from "./agent-client.js";

it("connects to the selected headless server and rejects stale discovery and stopped servers", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "mcp-headless-"));
  const env = { ...process.env, CHALK_REVIEW_SERVER_DIR: stateDir };
  const controller = new AbortController();
  const ready = Promise.withResolvers<ReviewServerDiscovery>();

  const running = runHeadlessServer({
    stateDir,
    signal: controller.signal,
    onReady: ready.resolve,
  });

  try {
    const discovery = await Promise.race([
      ready.promise,
      running.then(() => {
        throw new Error("Server exited before readiness");
      }),
    ]);

    const client = await connectReviewApi(env);

    expect(client.connection).toEqual({
      serverUrl: discovery.url,
      token: discovery.token,
    });
    expect(await client.read("/capabilities")).toMatchObject({
      desktopAvailable: false,
    });

    const discoveryPath = reviewServerDiscoveryPath(stateDir);
    const original = await readFile(discoveryPath, "utf8");

    await writeFile(
      discoveryPath,
      JSON.stringify({ ...JSON.parse(original), instanceId: randomUUID() }),
    );
    await expect(connectReviewApi(env)).rejects.toThrow(/not ready/);

    await writeFile(discoveryPath, original);
    controller.abort();
    await running;
    await expect(connectReviewApi(env)).rejects.toThrow(/chalk server start/);
  } finally {
    controller.abort();
    await running;
    await rm(stateDir, { recursive: true, force: true });
  }
});
