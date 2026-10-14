import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test(
  "the built desktop host serves its packaged guidance, tutorial, and command setup",
  { timeout: 20_000 },
  async () => {
    execFileSync(process.execPath, ["scripts/build-host.mjs"], {
      cwd: path.join(root, "apps/review-electrobun"),
    });

    const home = await mkdtemp(path.join(tmpdir(), "built-desktop-host-"));

    const child = spawn(
      process.execPath,
      [path.join(root, "apps/review-electrobun/runtime/dist/desktop-host.js")],
      {
        env: {
          ...process.env,
          DEV_REVIEW_HOME: home,
          DEV_FAST_REVIEW_SERVER_PORT: "0",
          DEV_FAST_REVIEW_APP_PID: String(process.pid),
          DEV_FAST_REVIEW_CLI_ROOT: path.join(root, "packages/cli"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const exited = once(child, "exit");

    const lines = createInterface({ input: child.stdout });

    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);

    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));

    try {
      const [line] = await Promise.race([
        once(lines, "line"),
        exited.then(() => {
          throw new Error(stderr || "Desktop host exited before ready.");
        }),
      ]);

      const discovery = JSON.parse(line);
      assert.equal(discovery.event, "ready");

      const headers = { "x-review-token": discovery.token };

      const health = await fetch(`${discovery.url}/health`, { headers });

      assert.equal(
        (await health.json()).commit,
        execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: root,
          encoding: "utf8",
        }).trim(),
      );

      const guidance = await fetch(
        `${discovery.url}/reviews-api/instructions`,
        {
          headers,
        },
      );

      assert.equal(guidance.status, 200);
      assert.ok((await guidance.json()).length > 0);

      const tutorial = await fetch(`${discovery.url}/tutorial/prepare`, {
        method: "POST",
        headers,
      });

      assert.equal(tutorial.status, 200);
      assert.ok((await tutorial.json()).reviewUuid);

      const setup = await fetch(`${discovery.url}/install/status`, { headers });
      assert.equal(setup.status, 200);
      assert.equal((await setup.json()).cli?.path, discovery.cliPath);
    } finally {
      child.kill("SIGTERM");
      lines.close();

      const [code] = await exited;
      clearTimeout(timer);
      await rm(home, { recursive: true, force: true });
      assert.equal(code, 0, stderr);
    }
  },
);
