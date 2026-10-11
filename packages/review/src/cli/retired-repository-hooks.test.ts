import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { shellQuote } from "@review/lib/shell-quote";
import { afterEach, expect, it } from "vitest";

import { retireRepositoryHooks } from "./retired-repository-hooks";

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });

  if (r.status !== 0) throw new Error(r.stderr);

  return r.stdout.trim();
}

async function fixture(commandKind = "owned") {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "retire-repo-"));
  homes.push(homeDir);
  const root = path.join(homeDir, "repo");
  await mkdir(root);
  git(root, ["init"]);
  const owned = path.join(homeDir, "bin/custom.cmd");

  const command = shellQuote(
    commandKind === "owned" ? owned : "/missing/foreign/blackboard",
  );

  const commonDir = path.join(root, ".git");
  const hooks = path.join(commonDir, "dev-fast/trace-hooks/hooks");
  const predecessor = "predecessor";
  await mkdir(hooks, { recursive: true });
  await mkdir(path.join(root, predecessor));

  const previous =
    'root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"\nprevious="$root"/' +
    shellQuote(path.join(predecessor, "prepare-commit-msg"));

  await writeFile(
    path.join(hooks, "prepare-commit-msg"),
    `#!/bin/sh\n${previous}\nif [ -x "$previous" ]; then\n  "$previous" "$@" || exit $?\nfi\n${command} trace git-hook prepare-commit-msg "$@" || true\nexit 0\n`,
  );

  const previousPush =
    'root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"\nprevious="$root"/' +
    shellQuote(path.join(predecessor, "pre-push"));

  await writeFile(
    path.join(hooks, "pre-push"),
    `#!/bin/sh\n${previousPush}\ntmp="$(mktemp "\${TMPDIR:-/tmp}/review-pre-push.XXXXXX")" || exit 0\ntrap 'rm -f "$tmp"' EXIT HUP INT TERM\ncat > "$tmp"\nif [ -x "$previous" ]; then\n  "$previous" "$@" < "$tmp" || exit $?\nfi\n${command} trace git-hook pre-push "$@" < "$tmp" || true\nexit 0\n`,
  );
  await writeFile(
    path.join(path.dirname(hooks), "state.json"),
    JSON.stringify({
      version: 1,
      root,
      managedHooksPath: hooks,
      previousHooksPath: predecessor,
      previousHookDirectory: predecessor,
      previousWasConfigured: true,
      command,
    }),
  );
  git(root, ["config", "core.hooksPath", hooks]);
  const registry = path.join(homeDir, ".config/dev-trace/repositories.json");
  await mkdir(path.dirname(registry), { recursive: true });
  await writeFile(registry, JSON.stringify([root]));

  return {
    input: { homeDir, env: {}, ownedCommands: [owned] },
    root,
    hooks,
    registry,
  };
}

it("restores the relative predecessor and its arguments, stdin and exit status", async () => {
  const f = await fixture();
  await writeFile(
    path.join(f.root, "predecessor/pre-push"),
    '#!/bin/sh\nprintf "%s/%s\\n" "$1" "$2"\ncat\nexit 9\n',
    { mode: 0o755 },
  );
  await writeFile(path.join(path.dirname(f.hooks), "unknown.txt"), "user data");
  expect((await retireRepositoryHooks(f.input)).complete).toBe(true);
  expect(git(f.root, ["config", "--get", "core.hooksPath"])).toBe(
    "predecessor",
  );
  const payload = path.join(f.input.homeDir, "stdin");
  await writeFile(payload, "payload\n");

  const hook = spawnSync(
    "git",
    ["hook", "run", `--to-stdin=${payload}`, "pre-push", "--", "origin", "url"],
    { cwd: f.root, input: "payload\n", encoding: "utf8" },
  );

  expect(hook.status).toBe(9);
  expect(hook.stderr).toContain("origin/url\npayload\n");
  expect(
    await readFile(path.join(path.dirname(f.hooks), "unknown.txt"), "utf8"),
  ).toBe("user data");
  expect((await retireRepositoryHooks(f.input)).complete).toBe(true);
});

it("preserves wrappers owned by a different missing command", async () => {
  const f = await fixture("foreign");
  expect((await retireRepositoryHooks(f.input)).complete).toBe(true);
  expect(git(f.root, ["config", "--get", "core.hooksPath"])).toBe(f.hooks);
  expect(JSON.parse(await readFile(f.registry, "utf8"))).toEqual([f.root]);
});

it("preserves a replaced wrapper and later user hooksPath", async () => {
  const f = await fixture();
  await writeFile(path.join(f.hooks, "pre-push"), "handwritten hook");
  git(f.root, ["config", "core.hooksPath", "later-user-hooks"]);
  expect((await retireRepositoryHooks(f.input)).complete).toBe(true);
  expect(await readFile(path.join(f.hooks, "pre-push"), "utf8")).toBe(
    "handwritten hook",
  );
  expect(git(f.root, ["config", "--get", "core.hooksPath"])).toBe(
    "later-user-hooks",
  );
});

it("keeps inaccessible registered repositories retryable", async () => {
  const f = await fixture();
  await writeFile(f.registry, JSON.stringify([path.join(f.root, "missing")]));
  expect((await retireRepositoryHooks(f.input)).complete).toBe(false);
});

it("deduplicates linked worktrees sharing one hook state", async () => {
  const f = await fixture();
  git(f.root, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--allow-empty",
    "-m",
    "fixture",
  ]);
  const linked = path.join(f.input.homeDir, "linked");
  git(f.root, ["worktree", "add", "-b", "linked", linked]);
  await writeFile(f.registry, JSON.stringify([f.root, linked]));
  expect((await retireRepositoryHooks(f.input)).complete).toBe(true);
  expect(JSON.parse(await readFile(f.registry, "utf8"))).toEqual([]);
  expect(git(linked, ["config", "--get", "core.hooksPath"])).toBe(
    "predecessor",
  );
});

it("unsets only the local override so an inherited global hooksPath resumes", async () => {
  const f = await fixture();
  const stateFile = path.join(path.dirname(f.hooks), "state.json");
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  state.previousWasConfigured = false;
  await writeFile(stateFile, JSON.stringify(state));
  const global = path.join(f.input.homeDir, "global.cfg");
  const predecessor = path.join(f.input.homeDir, "global-hooks");
  git(f.root, ["config", "--file", global, "core.hooksPath", predecessor]);
  f.input.env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: global,
    GIT_CONFIG_NOSYSTEM: "1",
  };
  expect((await retireRepositoryHooks(f.input)).complete).toBe(true);

  const result = spawnSync("git", ["config", "--get", "core.hooksPath"], {
    cwd: f.root,
    env: f.input.env,
    encoding: "utf8",
  });

  expect(result.stdout.trim()).toBe(predecessor);
});

it("finishes partial cleanup when one generated wrapper is already absent", async () => {
  const f = await fixture();
  await rm(path.join(f.hooks, "prepare-commit-msg"));
  expect((await retireRepositoryHooks(f.input)).complete).toBe(true);
  expect(git(f.root, ["config", "--get", "core.hooksPath"])).toBe(
    "predecessor",
  );
});

it("restores a custom absolute predecessor path", async () => {
  const f = await fixture();
  const previous = path.join(f.root, "predecessor");
  const stateFile = path.join(path.dirname(f.hooks), "state.json");
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  state.previousHooksPath = previous;
  state.previousHookDirectory = previous;
  await writeFile(stateFile, JSON.stringify(state));

  for (const name of ["prepare-commit-msg", "pre-push"]) {
    const file = path.join(f.hooks, name);
    const source = await readFile(file, "utf8");
    const start = source.indexOf("if [ -x");
    await writeFile(
      file,
      `#!/bin/sh\nprevious=${shellQuote(path.join(previous, name))}\n` +
        (name === "pre-push"
          ? source.slice(source.indexOf('tmp="'))
          : source.slice(start)),
    );
  }

  expect((await retireRepositoryHooks(f.input)).complete).toBe(true);
  expect(git(f.root, ["config", "--get", "core.hooksPath"])).toBe(previous);
});
