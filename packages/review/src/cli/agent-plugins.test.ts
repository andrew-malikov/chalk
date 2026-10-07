import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { findReviewPackageRoot } from "@review/package-paths";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const repoRoot = path.resolve(
  findReviewPackageRoot(import.meta.url),
  "..",
  "..",
);

describe("agent plugin manifests", () => {
  it.skipIf(process.platform === "win32")(
    "the Codex plugin's launcher runs blackboard mcp from the home shim",
    async () => {
      const codex = path.join(repoRoot, "packages/agent-plugins/codex");

      const manifest = z
        .object({
          mcpServers: z.object({
            blackboard: z.object({ command: z.string(), cwd: z.string() }),
          }),
        })
        .parse(
          JSON.parse(await readFile(path.join(codex, ".mcp.json"), "utf8")),
        ).mcpServers.blackboard;

      // Windows resolves the extensionless command to its .cmd twin.
      await readFile(path.join(codex, `${manifest.command}.cmd`));

      const home = await mkdtemp(path.join(os.tmpdir(), "codex-launch-"));

      try {
        const shim = path.join(home, ".local/bin/blackboard");
        await mkdir(path.dirname(shim), { recursive: true });
        await writeFile(shim, '#!/bin/sh\necho "$@"\n');
        await chmod(shim, 0o755);

        const { stdout } = await promisify(execFile)(manifest.command, [], {
          cwd: path.join(codex, manifest.cwd),
          env: { ...process.env, HOME: home },
        });

        expect(stdout.trim()).toBe("mcp");
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    },
  );
});
