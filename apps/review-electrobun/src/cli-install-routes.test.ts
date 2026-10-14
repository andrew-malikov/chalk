import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { GlobalReviewDesktopVerbRelay } from "@chalk/server/global-verb-relay";
import { createReviewServerApp } from "@chalk/server/review-server-core";
import { cliInstallStampPath } from "@review/node/cli-install";
import { afterEach, expect, it, vi } from "vitest";

import { mountCliInstallRoutes } from "./cli-install-routes";

afterEach(() => vi.unstubAllEnvs());

it("authenticates desktop setup routes before changing command setup", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "desktop-command-setup-"));
  vi.stubEnv("DEV_REVIEW_HOME", home);

  const discovery = {
    version: 3 as const,
    instanceId: "desktop",
    url: "http://desktop.test",
    token: "setup-token",
    appPid: process.pid,
    serverPid: process.pid,
    startedAt: Date.now(),
  };

  const relay = new GlobalReviewDesktopVerbRelay();

  const app = createReviewServerApp({
    token: discovery.token,
    instanceId: discovery.instanceId,
    serverId: "test-server",
    relay,
  });

  mountCliInstallRoutes(app, discovery, home);

  try {
    const denied = await app.request("/install/skip", { method: "POST" });
    expect(denied.status).toBe(401);
    await expect(readFile(cliInstallStampPath())).rejects.toThrow("ENOENT");

    const allowed = await app.request("/install/skip", {
      method: "POST",
      headers: { "x-review-token": discovery.token },
    });

    expect(allowed.status).toBe(200);
    expect(
      JSON.parse(await readFile(cliInstallStampPath(), "utf8")),
    ).toMatchObject({
      consent: "skipped",
    });

    const invalid = await app.request("/install/remove", {
      method: "POST",
      headers: {
        "x-review-token": discovery.token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ shim: "yes" }),
    });

    expect(invalid.status).toBe(400);
  } finally {
    relay.close();
    await rm(home, { recursive: true, force: true });
  }
});
