import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { runReviewCli } from "./cli-runner";
import { runReviewAppPick as runReviewAppActual } from "./review-app";
import { runReviewAppLaunch as runReviewAppLaunchActual } from "./review-app-launcher";
import { runReviewInfo as runReviewInfoActual } from "./review-info";

describe("Blackboard CLI", () => {
  it("routes Cursor install instructions without connecting to Desktop", async () => {
    const { code, stdout, stderr } = await runConnect(
      ["connect", "cursor", "--json"],
      installTestShim,
    );

    expect(code).toBe(0);
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(Object.keys(result.prompts)).toEqual(["cursor"]);
    const link = new URL(result.prompts.cursor.match(/cursor:\/\/\S+/)[0]);
    expect(link.hostname).toBe("anysphere.cursor-deeplink");
    expect(
      JSON.parse(
        Buffer.from(link.searchParams.get("config")!, "base64").toString(),
      ),
    ).toEqual({
      command: "sh",
      args: ["-c", 'exec "$HOME/.local/bin/blackboard" mcp'],
    });
  });

  it("prints only scanner-owned cleanup paths", async () => {
    let owned = "";
    let plugin = "";
    let unrelated = "";

    const { code, stdout } = await runConnect(
      ["connect", "--json"],
      async (home) => {
        await installTestShim(home);
        owned = path.join(home, ".agents", "skills", "dev-review");
        unrelated = path.join(home, ".agents", "skills", "review");
        plugin = path.join(home, ".config", "opencode", "plugins", "review.ts");
        await mkdir(owned, { recursive: true });
        await mkdir(unrelated, { recursive: true });
        await mkdir(path.dirname(plugin), { recursive: true });
        await writeFile(
          path.join(owned, "SKILL.md"),
          '---\nmetadata:\n  review-managed-by: "Review Desktop"\n  review-generated: "Do not edit."\n  review-version: "development"\n---\n',
        );
        await writeFile(path.join(unrelated, "SKILL.md"), "User-owned skill");
        await writeFile(
          plugin,
          "// Managed by Review Desktop (@dev.fast/review).\n",
        );
      },
    );

    expect(code).toBe(0);

    for (const prompt of Object.values(JSON.parse(stdout).prompts)) {
      expect(prompt).toContain(JSON.stringify(owned));
      expect(prompt).toContain(JSON.stringify(plugin));
      expect(prompt).not.toContain(JSON.stringify(unrelated));
    }
  });

  it("prints every prompt with headings by default", async () => {
    const { code, stdout } = await runConnect(["connect"]);

    expect(code).toBe(0);
    expect(stdout).toContain("## Claude Code");
    expect(stdout).toContain("## Pi");
  });

  it("emits the selected prompts as one JSON event", async () => {
    const { code, stdout } = await runConnect([
      "connect",
      "claude-code",
      "--json",
    ]);

    const event = JSON.parse(stdout);

    expect(code).toBe(0);
    expect(event.event).toBe("connect");
    expect(Object.keys(event.prompts)).toEqual(["claude"]);
  });

  it("prints the package version", async () => {
    const stdout = outputStream();
    let output = "";
    stdout.on("data", (chunk) => (output += String(chunk)));

    await expect(
      runReviewCli({
        argv: ["version"],
        cliVersion: "1.2.3",
        stdout,
        stderr: outputStream(),
      }),
    ).resolves.toBe(0);
    expect(output).toBe("1.2.3\n");
  });

  it("ignores legacy telemetry configuration without sending requests or creating storage", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "review-cli-home-"));

    const env = {
      DEV_REVIEW_HOME: home,
      PROGRESSIVE_REVIEW_POSTHOG_KEY: "fake-key",
      PROGRESSIVE_REVIEW_POSTHOG_HOST: "http://127.0.0.1:1",
    };

    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const stdout = outputStream();
    const stderr = outputStream();
    let output = "";
    let errors = "";
    stdout.on("data", (chunk) => (output += String(chunk)));
    stderr.on("data", (chunk) => (errors += String(chunk)));

    try {
      expect(
        await runReviewCli({
          argv: ["version"],
          cliVersion: "1.2.3",
          env,
          stdout,
          stderr,
        }),
      ).toBe(0);
      expect(output).toBe("1.2.3\n");
      expect(
        await runReviewCli({
          argv: ["info"],
          env,
          stdout,
          stderr,
          runtime: {
            runReviewInfo: async () => {
              throw new Error("controlled failure");
            },
          },
        }),
      ).toBe(1);
      expect(errors).toContain("controlled failure");
      expect(fetch).not.toHaveBeenCalled();
      expect(await readdir(home)).toEqual([]);
    } finally {
      fetch.mockRestore();
      await rm(home, { recursive: true, force: true });
    }
  });

  // The JSON authoring verbs are the only remaining surface no other case
  // drives; both print the agent CLI help without contacting the Desktop.
  it.each([["api"], ["mcp", "--help"]])(
    "registers the JSON authoring verb %j",
    async (...argv) => {
      const stdout = outputStream();
      let output = "";
      stdout.on("data", (chunk) => (output += String(chunk)));

      await expect(
        runReviewCli({
          argv,
          stdout,
          stderr: outputStream(),
        }),
      ).resolves.toBe(0);
      expect(output).toContain("blackboard api tools");
    },
  );

  it.each([
    [["app", "launch"], "launched", undefined, false],
    [["app"], "running", undefined, false],
    [["app", "launch", "--focus"], "running", true, false],
    [["app", "--focus"], "launched", true, false],
    [["app", "launch", "--no-sandbox"], "launched", undefined, true],
    [["app", "--no-sandbox"], "launched", undefined, true],
  ] as const)(
    "supports the app launch command and bare alias: %j",
    async (argv, state, focus, noSandbox) => {
      const runReviewAppLaunch = vi.fn<typeof runReviewAppLaunchActual>(
        async () => ({
          event: "app",
          action: "launch",
          state,
          instanceId: "desktop-1",
        }),
      );

      const stdout = outputStream();
      let output = "";
      stdout.on("data", (chunk) => (output += String(chunk)));

      await expect(
        runReviewCli({
          argv: [...argv, "--json"],
          cwd: "/outside-a-repository",
          stdin: Readable.from([]),
          stdout,
          stderr: outputStream(),
          runtime: { runReviewAppLaunch },
        }),
      ).resolves.toBe(0);
      expect(runReviewAppLaunch).toHaveBeenCalledWith({
        focus,
        noSandbox,
      });
      expect(JSON.parse(output)).toEqual({
        event: "app",
        action: "launch",
        state,
        instanceId: "desktop-1",
      });
    },
  );

  it("passes --focus through app pick", async () => {
    const runReviewAppPick = vi.fn<typeof runReviewAppActual>(async () => ({
      event: "app",
      action: "pick",
      reviewUuid: "review-uuid",
      title: "Picked",
    }));

    await expect(
      runReviewCli({
        argv: ["app", "pick", "--session", "review-uuid", "--focus", "--json"],
        cwd: "/outside-a-repository",
        stdin: Readable.from([]),
        stdout: outputStream(),
        stderr: outputStream(),
        runtime: { runReviewAppPick },
      }),
    ).resolves.toBe(0);
    expect(runReviewAppPick).toHaveBeenCalledWith(
      expect.objectContaining({ reviewUuid: "review-uuid", focus: true }),
    );
  });

  it("supports the app pick subcommand", async () => {
    const argv = ["app", "pick", "--session", "review-uuid"];

    const runReviewAppPick = vi.fn<typeof runReviewAppActual>(async () => ({
      event: "app",
      action: "pick",
      reviewUuid: "review-uuid",
      title: "Review",
    }));

    const stdout = outputStream();
    let output = "";
    stdout.on("data", (chunk) => (output += String(chunk)));

    await expect(
      runReviewCli({
        argv: [...argv, "--json"],
        stdout,
        stderr: outputStream(),
        runtime: { runReviewAppPick },
      }),
    ).resolves.toBe(0);
    expect(runReviewAppPick).toHaveBeenCalledWith(
      expect.objectContaining({ reviewUuid: "review-uuid" }),
    );
    expect(JSON.parse(output)).toMatchObject({
      event: "app",
      action: "pick",
      reviewUuid: "review-uuid",
    });
  });

  it("rejects an invalid --view for app pick", async () => {
    await expect(
      runReviewCli({
        argv: ["app", "pick", "--session", "review-uuid", "--view", "files"],
        stdout: outputStream(),
        stderr: outputStream(),
      }),
    ).resolves.toBe(1);
  });
});

function outputStream(): PassThrough {
  return new PassThrough();
}

async function installTestShim(home: string): Promise<void> {
  const bin = path.join(home, ".local", "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, "blackboard"), "# Managed by Blackboard\n");
}

async function runConnect(
  argv: string[],
  setup?: (homeDir: string) => Promise<void>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "review-connect-"));

  const stdout = outputStream();
  const stderr = outputStream();

  let stdoutText = "";
  let stderrText = "";

  stdout.on("data", (chunk) => (stdoutText += String(chunk)));
  stderr.on("data", (chunk) => (stderrText += String(chunk)));

  try {
    await setup?.(homeDir);

    const code = await runReviewCli({
      argv,
      cwd: homeDir,
      env: {
        HOME: homeDir,
        TRACE_HOME_DIR: homeDir,
        DEV_REVIEW_HOME: path.join(homeDir, ".dev"),
      },
      stdout,
      stderr,
    });

    return { code, stdout: stdoutText, stderr: stderrText };
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
}

it("rejects retired trace commands through the ordinary command parser", async () => {
  for (const argv of [
    ["trace", "status"],
    ["trace", "hook", "stop"],
    ["trace", "storage", "use", "hosted"],
  ]) {
    const stderr = new PassThrough();
    let output = "";
    const stdout = new PassThrough();
    stdout.on("data", (chunk) => (output += String(chunk)));
    expect(
      await runReviewCli({
        argv,
        stdout,
        stderr,
        env: { HOME: "/tmp/nonexistent-blackboard-test-home" },
      }),
    ).toBe(1);
    expect(output).toMatch(/unknown command/);
  }
});
