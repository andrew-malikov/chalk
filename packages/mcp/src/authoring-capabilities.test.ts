import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseReviewDesktopVerbFrame } from "@chalk/review-contracts";
import { createGlobalReviewServer } from "@chalk/server/desktop-server.js";
import { GlobalReviewDesktopVerbRelay } from "@chalk/server/global-verb-relay.js";
import { openLocalReviewStore } from "@review/node/review-api/local-data.js";
import { expect, it } from "vitest";

import { connectReviewApi } from "./agent-client.js";

it("discovers the live Desktop map preference without opening a review", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "review-capabilities-"));

  const env = {
    ...process.env,
    DEV_REVIEW_HOME: home,
    DEV_REVIEW_SERVER_DIR: "",
  };

  const local = openLocalReviewStore(path.join(home, "review-api.db"));
  const relay = new GlobalReviewDesktopVerbRelay();
  let softwareMapEnabled = false;
  let opened = false;
  relay.attach({
    signal: new AbortController().signal,
    write(frame) {
      const { id, request } = parseReviewDesktopVerbFrame(
        JSON.parse(frame.slice("data: ".length).trim()),
      );

      if (request.name === "openApiReview") opened = true;
      relay.acceptResult({
        id,
        response: { ok: true, result: { softwareMapEnabled } },
      });
    },
    close() {},
  });

  const server = createGlobalReviewServer({
    reviewStore: local.store,
    reviewData: local.data,
    appPid: process.pid,
    packageRoot: home,
    toolingRoot: home,
    port: 0,
    relay,
    discoveryPath: path.join(home, "review-desktop", "server.json"),
  });

  try {
    await server.listen();
    // A previous headless process must not hijack the Desktop connection.
    await mkdir(path.join(home, "review-server"));
    await writeFile(
      path.join(home, "review-server", "server.json"),
      JSON.stringify({
        version: 1,
        instanceId: randomUUID(),
        url: server.discovery.url,
        serverPid: process.pid,
        token: "expired-headless-token",
      }),
    );
    const client = await connectReviewApi(env);
    expect(await client.read("/capabilities")).toMatchObject({
      desktopAvailable: true,
      softwareMapEnabled: false,
      scratchpadEnabled: false,
    });
    softwareMapEnabled = true;
    expect(await client.read("/capabilities")).toMatchObject({
      desktopAvailable: true,
      softwareMapEnabled: true,
    });
    expect(opened).toBe(false);
    await expect(
      connectReviewApi({ ...env, DEV_REVIEW_SERVER_DIR: home }),
    ).rejects.toThrow(/chalk server start/g);
    relay.close();
    expect(await client.read("/capabilities")).toMatchObject({
      desktopAvailable: false,
      softwareMapEnabled: false,
    });
    await expect(
      connectReviewApi({
        ...env,
        DEV_REVIEW_SERVER_DIR: path.join(home, "missing"),
      }),
    ).rejects.toThrow(/chalk server start/g);
  } finally {
    await server.close();
    await local.data.close();
    await local.store.close();
    await rm(home, { recursive: true, force: true });
  }
});
