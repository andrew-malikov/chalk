import { lstat, realpath, rm, rmdir } from "node:fs/promises";
import path from "node:path";

import { gitAt } from "@dev.fast/local-vcs";
import { writePrivateJsonAtomic } from "@review/lib/atomic-write";
import { errorMessage } from "@review/lib/error-message";
import { shellQuote } from "@review/lib/shell-quote";
import { z } from "zod";

import { readRetiredFile } from "./retired-agent-hooks";
import type { RetirementInput, RetirementResult } from "./retired-trace-hooks";

const stateSchema = z.object({
  version: z.literal(1),
  root: z.string(),
  managedHooksPath: z.string(),
  previousHooksPath: z.string(),
  previousHookDirectory: z.string(),
  previousWasConfigured: z.boolean(),
  command: z.string().optional(),
});

export async function retireRepositoryHooks(
  input: RetirementInput,
): Promise<RetirementResult> {
  const registry = path.join(
    input.homeDir,
    ".config/dev-trace/repositories.json",
  );

  const source = await readRetiredFile(registry);

  if (source === null) return { complete: true, warnings: [] };
  const roots = z.array(z.string().min(1)).parse(JSON.parse(source));
  const remaining = new Set(roots);
  const seen = new Map<string, boolean>();
  const warnings: string[] = [];
  let complete = true;

  for (const cwd of roots) {
    try {
      const common = await gitAt(
        cwd,
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        { env: input.env },
      );

      const commonDir = common.stdout.trim();

      if (seen.has(commonDir)) {
        if (seen.get(commonDir)) remaining.delete(cwd);
        continue;
      }

      seen.set(commonDir, false);
      const stateDir = path.join(commonDir, "dev-fast/trace-hooks");
      const file = path.join(stateDir, "state.json");
      const raw = await readRetiredFile(file);

      if (raw === null) {
        remaining.delete(cwd);
        continue;
      }

      const state = stateSchema.parse(JSON.parse(raw));
      const hooks = path.join(stateDir, "hooks");

      if (
        (await canonicalHookPath(state.managedHooksPath)) !==
          (await canonicalHookPath(hooks)) ||
        !input.ownedCommands.some(
          (command) => state.command === shellQuote(command),
        )
      ) {
        warnings.push(
          `preserved ${cwd}: unknown or foreign repository hook ownership`,
        );
        continue;
      }

      const expected = [
        prepareCommitMessageHook(state.previousHookDirectory, state.command!),
        prePushHook(state.previousHookDirectory, state.command!),
      ];

      const names = ["prepare-commit-msg", "pre-push"];

      const actual = await Promise.all(
        names.map((name) => readRetiredFile(path.join(hooks, name))),
      );

      if (
        actual.some(
          (source, index) => source !== null && source !== expected[index],
        )
      ) {
        warnings.push(`preserved ${cwd}: repository wrapper was replaced`);
        continue;
      }

      const current = await gitAt(
        cwd,
        ["config", "--local", "--get", "core.hooksPath"],
        { allowFailure: true, env: input.env },
      );

      if (!current.ok && current.stderr.trim())
        throw new Error(
          current.stderr || "Cannot read repository hook configuration",
        );

      const root = await gitAt(cwd, ["rev-parse", "--show-toplevel"], {
        env: input.env,
      });

      if (
        current.ok &&
        (await canonicalHookPath(
          path.resolve(root.stdout.trim(), current.stdout.trim()),
        )) === (await canonicalHookPath(hooks))
      ) {
        if (state.previousWasConfigured)
          await gitAt(
            cwd,
            ["config", "--local", "core.hooksPath", state.previousHooksPath],
            { env: input.env },
          );
        else
          await gitAt(cwd, ["config", "--local", "--unset", "core.hooksPath"], {
            env: input.env,
          });
      }

      for (const name of names)
        await rm(path.join(hooks, name), { force: true });
      await rm(file);
      await pruneEmpty(hooks);
      await pruneEmpty(stateDir);
      remaining.delete(cwd);
      seen.set(commonDir, true);
    } catch (error) {
      complete = false;
      warnings.push(`${cwd}: ${errorMessage(error)}`);
    }
  }

  if (remaining.size !== roots.length)
    await writePrivateJsonAtomic(registry, [...remaining]);

  return { complete, warnings };
}

/** Resolve existing ancestors even when a prior cleanup removed the directory.
 * A dangling symlink is an existing entry, so preserve that failure for retry. */
async function canonicalHookPath(value: string): Promise<string> {
  try {
    return await realpath(value);
  } catch (error) {
    if (!(error instanceof Error) || !isMissingPath(error)) throw error;

    const entry = await lstat(value).catch((failure) => {
      if (failure instanceof Error && isMissingPath(failure)) return null;
      throw failure;
    });

    if (entry !== null) throw error;

    const parent = path.dirname(value);

    if (parent === value) throw error;

    return path.join(await canonicalHookPath(parent), path.basename(value));
  }
}

function isMissingPath(error: Error): boolean {
  return "code" in error && error.code === "ENOENT";
}

async function pruneEmpty(dir: string) {
  try {
    await rmdir(dir);
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        "code" in error &&
        ["ENOENT", "ENOTEMPTY", "EEXIST"].includes(String(error.code))
      )
    )
      throw error;
  }
}

function previousHookSetup(pathValue: string, name: string): string {
  if (path.isAbsolute(pathValue)) {
    return `previous=${shellQuote(path.join(pathValue, name))}`;
  }

  return [
    'root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"',
    `previous="$root"/${shellQuote(path.join(pathValue, name))}`,
  ].join("\n");
}

function prepareCommitMessageHook(
  previousPath: string,
  reviewCommand: string,
): string {
  const previous = previousHookSetup(previousPath, "prepare-commit-msg");
  const review = reviewCommand;

  return `#!/bin/sh\n${previous}\nif [ -x "$previous" ]; then\n  "$previous" "$@" || exit $?\nfi\n${review} trace git-hook prepare-commit-msg "$@" || true\nexit 0\n`;
}

function prePushHook(previousPath: string, reviewCommand: string): string {
  const previous = previousHookSetup(previousPath, "pre-push");
  const review = reviewCommand;

  return `#!/bin/sh\n${previous}\ntmp="$(mktemp "\${TMPDIR:-/tmp}/review-pre-push.XXXXXX")" || exit 0\ntrap 'rm -f "$tmp"' EXIT HUP INT TERM\ncat > "$tmp"\nif [ -x "$previous" ]; then\n  "$previous" "$@" < "$tmp" || exit $?\nfi\n${review} trace git-hook pre-push "$@" < "$tmp" || true\nexit 0\n`;
}
