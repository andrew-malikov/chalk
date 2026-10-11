import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, it } from "vitest";

import { retireAgentHooks } from "./retired-agent-hooks";

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

async function fixture() {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "retire-agents-"));
  homes.push(homeDir);

  return {
    homeDir,
    env: { XDG_CONFIG_HOME: path.join(homeDir, "config") },
    ownedCommands: [path.join(homeDir, "bin/custom.cmd")],
  };
}

it("removes marked owned extensions, preserving foreign missing launchers", async () => {
  const input = await fixture();
  const pi = path.join(input.homeDir, ".pi/agent/extensions/review-trace.ts");

  const opencode = path.join(
    input.env.XDG_CONFIG_HOME,
    "opencode/plugins/review-trace.ts",
  );

  await mkdir(path.dirname(pi), { recursive: true });
  await mkdir(path.dirname(opencode), { recursive: true });

  const source = (command: string) =>
    `// Managed by Review Desktop trace setup\nspawn(${JSON.stringify(command)}, ["trace", "hook", eventName]);\n`;

  await writeFile(pi, source(input.ownedCommands[0]!));
  await writeFile(opencode, source("/missing/other/blackboard"));
  const warnings = await retireAgentHooks(input);
  await expect(readFile(pi)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(opencode, "utf8")).toBe(
    source("/missing/other/blackboard"),
  );
  expect(warnings.join(" ")).toContain("preserved");
});

it("preserves unmarked handwritten same-command Claude and Codex configuration", async () => {
  const input = await fixture();
  const claude = path.join(input.homeDir, ".claude/settings.json");
  const codex = path.join(input.homeDir, ".codex/config.toml");

  const sources = [
    JSON.stringify({
      hooks: {
        SessionEnd: [
          {
            hooks: [
              {
                type: "command",
                command: `'${input.ownedCommands[0]}' trace hook SessionEnd`,
              },
            ],
          },
        ],
      },
      other: true,
    }),
    `model="test"\n[[hooks.SessionEnd]]\n[[hooks.SessionEnd.hooks]]\ntype = "command"\ncommand = "same trace hook SessionEnd"\n`,
  ];

  for (const [i, file] of [claude, codex].entries()) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, sources[i]!);
  }

  const warnings = await retireAgentHooks(input);
  expect(warnings).toHaveLength(2);
  expect(await readFile(claude, "utf8")).toBe(sources[0]);
  expect(await readFile(codex, "utf8")).toBe(sources[1]);
});

it("removes only canonical groups inside a generated Codex marker", async () => {
  const input = await fixture();
  const file = path.join(input.homeDir, ".codex/config.toml");
  await mkdir(path.dirname(file), { recursive: true });
  const command = `'${input.ownedCommands[0]}' trace hook SessionEnd`;
  const group = `[[hooks.SessionEnd]]\n[[hooks.SessionEnd.hooks]]\ntype = "command"\ncommand = ${JSON.stringify(command)}\n`;
  await writeFile(
    file,
    `model="test"\n# review-trace-hooks:start\n${group}# review-trace-hooks:end\n`,
  );
  expect(await retireAgentHooks(input)).toEqual([]);
  expect(await readFile(file, "utf8")).toBe('model="test"\n');
  await writeFile(
    file,
    `# review-trace-hooks:start\n${group}custom = true\n# review-trace-hooks:end\n`,
  );
  const before = await readFile(file, "utf8");
  expect((await retireAgentHooks(input)).join(" ")).toContain("preserved");
  expect(await readFile(file, "utf8")).toBe(before);
});
