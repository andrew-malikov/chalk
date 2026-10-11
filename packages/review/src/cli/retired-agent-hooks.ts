import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { jsonString, parseJsonText } from "@dev.fast/json";
import { writeFileAtomicAsync } from "@review/lib/atomic-write";
import { shellQuote } from "@review/lib/shell-quote";

import type { RetirementInput } from "./retired-trace-hooks";

export async function readRetiredFile(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}

export async function retireAgentHooks(
  input: RetirementInput,
): Promise<string[]> {
  const warnings: string[] = [];

  const configHome =
    input.env.XDG_CONFIG_HOME?.trim() || path.join(input.homeDir, ".config");

  for (const file of [
    path.join(input.homeDir, ".pi/agent/extensions/review-trace.ts"),
    path.join(configHome, "opencode/plugins/review-trace.ts"),
  ]) {
    const source = await readRetiredFile(file);

    if (source === null) continue;

    const match = source
      .trimStart()
      .startsWith("// Managed by Review Desktop trace setup")
      ? /spawn\(("(?:[^"\\]|\\.)*"), \["trace", "hook"/.exec(source)
      : null;

    const command = match ? jsonString(parseJsonText(match[1])) : undefined;

    if (command && input.ownedCommands.includes(command)) await rm(file);
    else warnings.push(`preserved ${file}: unknown or foreign hook ownership`);
  }

  const claude = path.join(input.homeDir, ".claude/settings.json");
  const settings = await readRetiredFile(claude);

  if (settings?.includes(" trace hook "))
    warnings.push(
      `preserved ${claude}: unmarked lifecycle entries have unknown ownership`,
    );
  const codex = path.join(input.homeDir, ".codex/config.toml");
  const source = await readRetiredFile(codex);

  if (source !== null) {
    const next = source.replace(
      /^# review-trace-hooks:start\n[\s\S]*?^# review-trace-hooks:end(?:\n|$)/gm,
      (marked) => {
        const removed = transformCodexHooks(marked, (block, command, event) =>
          input.ownedCommands.some(
            (file) => command === `${shellQuote(file)} trace hook ${event}`,
          )
            ? ""
            : block,
        );

        return removed.replace(
          /^# review-trace-hooks:start\n\s*# review-trace-hooks:end(?:\n|$)/,
          "",
        );
      },
    );

    if (next !== source)
      await writeFileAtomicAsync(codex, next, { encoding: "utf8" });

    if (next.includes(" trace hook "))
      warnings.push(
        `preserved ${codex}: unknown or foreign lifecycle ownership`,
      );
  }

  return warnings;
}

function transformCodexHooks(
  content: string,
  transform: (block: string, command: string, event: string) => string,
): string {
  return content.replace(
    /^\[\[hooks\.(SessionStart|UserPromptSubmit|SessionEnd)\]\]\n\[\[hooks\.\1\.hooks\]\]\ntype = "command"\ncommand = ("(?:[^"\\\n]|\\.)*")(?:\n|$)(?:statusMessage = "[^"\n]*"(?:\n|$))?/gm,
    (block: string, event: string, encoded: string, offset: number) => {
      // A generated prefix is not proof of an entire owned group. Extra keys
      // and later child tables still depend on the parent header we remove.
      let reachedOtherTable = false;

      for (const line of content.slice(offset + block.length).split("\n")) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;

        if (!trimmed.startsWith("[")) {
          if (!reachedOtherTable) return block;
          continue;
        }

        const header = /^\[{1,2}([A-Za-z0-9_.-]+)\]{1,2}(?:\s*#.*)?$/.exec(
          trimmed,
        );

        // Unrecognized table syntax is preserved rather than guessed at.
        if (!header) return block;

        if (trimmed === `[[hooks.${event}]]`) break;

        if (
          header[1] === `hooks.${event}` ||
          header[1].startsWith(`hooks.${event}.`)
        )
          return block;
        reachedOtherTable = true;
      }

      try {
        const command = jsonString(parseJsonText(encoded));

        if (!command?.endsWith(` trace hook ${event}`)) return block;

        return transform(block, command, event);
      } catch {
        return block;
      }
    },
  );
}
