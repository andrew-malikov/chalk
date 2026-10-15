import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createGlobalReviewServer } from "@chalk/server/desktop-server";
import { openLocalReviewStore } from "@review/node/review-api/local-data";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

it("migrates diffr settings before listening, and starts despite invalid ones", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "review-diffr-startup-"));
  const devHome = path.join(root, "review");
  const file = path.join(root, "diffr", "config.toml");
  vi.stubEnv("CHALK_REVIEW_HOME", devHome);
  vi.stubEnv("XDG_CONFIG_HOME", root);
  await mkdir(devHome, { recursive: true });
  await mkdir(path.dirname(file));
  const local = openLocalReviewStore(path.join(devHome, "review-api.db"));

  const start = async () => {
    const server = createGlobalReviewServer({
      reviewStore: local.store,
      reviewData: local.data,
      appPid: process.pid,
      packageRoot: root,
      toolingRoot: root,
      port: 0,
      token: "diffr-startup-test-token",
      discoveryPath: path.join(devHome, "desktop.json"),
    });

    await server.listen();
    await server.close();
  };

  try {
    await writeFile(file, "[invalid TOML");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await start();
    expect(await readFile(file, "utf8")).toBe("[invalid TOML");

    await writeFile(
      file,
      "version = 1\n[plugins.bundled.context]\nlines = 17\nenabled = false\n",
    );
    await start();
    const migrated = await readFile(file, "utf8");
    expect(migrated).toMatch(/^version = 2$/m);
    expect(migrated).toContain("[plugins.shape.bundled.context]");
    expect(migrated).toMatch(/^lines = 17$/m);
  } finally {
    await local.data.close();
    await local.store.close();
    await rm(root, { recursive: true, force: true });
  }
});
