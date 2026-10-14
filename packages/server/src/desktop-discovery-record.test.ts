import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { openLocalReviewStore } from "@review/node/review-api/local-data";
import { afterEach, expect, it, vi } from "vitest";

import { createGlobalReviewServer } from "./desktop-server";

afterEach(() => vi.unstubAllEnvs());

const exists = (file: string) =>
  readFile(file, "utf8").then(
    () => true,
    () => false,
  );

it.each([
  ["stable", ["instances/stable.json", "server.json"]],
  ["preview", ["instances/preview.json"]],
] as const)(
  "writes the %s Desktop's records on listen and removes them on close",
  async (key, records) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "review-record-"));
    const devHome = path.join(root, "review");
    vi.stubEnv("CHALK_REVIEW_HOME", devHome);
    await mkdir(devHome, { recursive: true });
    const local = openLocalReviewStore(path.join(devHome, "review-api.db"));

    const server = createGlobalReviewServer({
      reviewStore: local.store,
      reviewData: local.data,
      appPid: process.pid,
      packageRoot: root,
      toolingRoot: root,
      port: 0,
      token: "record-test-token",
      identity: { key, channel: key },
    });

    const files = records.map((record) =>
      path.join(devHome, "review-desktop", record),
    );

    try {
      await server.listen();

      for (const file of files)
        expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({
          key,
          instanceId: server.discovery.instanceId,
          url: server.url,
        });

      // A pre-instance CLI reads only server.json; nothing but stable writes it.
      expect(
        await exists(path.join(devHome, "review-desktop", "server.json")),
      ).toBe(key === "stable");
    } finally {
      await server.close();
      await local.data.close();
      await local.store.close();
    }

    for (const file of files) expect(await exists(file)).toBe(false);
  },
);

it("advertises and reports the CLI from its own package", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "review-cli-record-"));

  const packageRoot = path.join(root, "review");

  const cliPackageRoot = path.join(root, "cli");

  const cliPath = path.join(cliPackageRoot, "dist/cli.js");

  vi.stubEnv("CHALK_REVIEW_HOME", root);
  await mkdir(path.dirname(cliPath), { recursive: true });
  await mkdir(path.join(packageRoot, "dist"), { recursive: true });
  await writeFile(cliPath, "// CLI fixture\n");
  await writeFile(path.join(packageRoot, "dist/cli.js"), "// old CLI\n");
  await writeFile(
    path.join(cliPackageRoot, "package.json"),
    '{"version":"1.2.3"}',
  );
  await writeFile(
    path.join(packageRoot, "package.json"),
    '{"version":"9.9.9"}',
  );

  const local = openLocalReviewStore(path.join(root, "review-api.db"));

  const server = createGlobalReviewServer({
    reviewStore: local.store,
    reviewData: local.data,
    appPid: process.pid,
    packageRoot,
    cliPackageRoot,
    toolingRoot: packageRoot,
    port: 0,
    token: "cli-record-test-token",
  });

  try {
    await server.listen();
    expect(server.discovery).toMatchObject({ cliPath, cliVersion: "1.2.3" });

    const response = await fetch(`${server.url}/reviews-api/status`, {
      headers: { "x-review-token": server.discovery.token },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      cliVersion: "1.2.3",
    });
  } finally {
    await server.close();
    await local.data.close();
    await local.store.close();
    await rm(root, { recursive: true, force: true });
  }
});
