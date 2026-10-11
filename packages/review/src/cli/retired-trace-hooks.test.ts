import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, it } from "vitest";

import { retireManagedTraceHooks } from "./retired-trace-hooks";
const homes: string[] = [];
afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});
it("retries failed registry reads instead of marking completion", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "retire-retry-"));
  homes.push(homeDir);
  const env = { DEV_REVIEW_HOME: path.join(homeDir, "profile") };
  const input = { homeDir, env, ownedCommands: [] };
  const registry = path.join(homeDir, ".config/dev-trace/repositories.json");
  await mkdir(path.dirname(registry), { recursive: true });
  await writeFile(registry, "not json");
  expect((await retireManagedTraceHooks(input)).complete).toBe(false);
  const marker = path.join(
    env.DEV_REVIEW_HOME,
    "review-desktop/state/retired-trace-hooks-v1.json",
  );
  await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
  await writeFile(registry, "[]");
  expect((await retireManagedTraceHooks(input)).complete).toBe(true);
  expect((await retireManagedTraceHooks(input)).complete).toBe(true);
});
it("inspects a new XDG scope for the same profile and command set", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "retire-xdg-"));
  homes.push(homeDir);
  const command = path.join(homeDir, "blackboard");
  const env = {
    DEV_REVIEW_HOME: path.join(homeDir, "profile"),
    XDG_CONFIG_HOME: path.join(homeDir, "first"),
  };
  expect(
    (await retireManagedTraceHooks({ homeDir, env, ownedCommands: [command] }))
      .complete,
  ).toBe(true);
  env.XDG_CONFIG_HOME = path.join(homeDir, "second");
  const extension = path.join(
    env.XDG_CONFIG_HOME,
    "opencode/plugins/review-trace.ts",
  );
  await mkdir(path.dirname(extension), { recursive: true });
  await writeFile(
    extension,
    `// Managed by Review Desktop trace setup\nspawn(${JSON.stringify(command)}, ["trace", "hook", eventName]);\n`,
  );
  expect(
    (await retireManagedTraceHooks({ homeDir, env, ownedCommands: [command] }))
      .complete,
  ).toBe(true);
  await expect(readFile(extension)).rejects.toMatchObject({ code: "ENOENT" });
});
