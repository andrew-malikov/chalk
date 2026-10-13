import path from "node:path";

import { writePrivateJsonAtomic } from "@review/lib/atomic-write";
import { errorMessage } from "@review/lib/error-message";
import { reviewDesktopStateDir } from "@review/storage/review-home-paths";
import { z } from "zod";

import { readRetiredFile, retireAgentHooks } from "./retired-agent-hooks";
import { retireRepositoryHooks } from "./retired-repository-hooks";

export interface RetirementInput {
  env: NodeJS.ProcessEnv;
  homeDir: string;
  ownedCommands: readonly string[];
}

export interface RetirementResult {
  complete: boolean;
  warnings: string[];
}

const markerSchema = z.object({
  version: z.literal(1),
  ownedCommands: z.array(z.string()),
  scope: z.object({ homeDir: z.string(), xdgConfigHome: z.string() }),
});

export async function retireManagedTraceHooks(
  input: RetirementInput,
): Promise<RetirementResult> {
  const marker = path.join(
    reviewDesktopStateDir(input.env),
    "retired-trace-hooks-v1.json",
  );

  const next = {
    version: 1 as const,
    ownedCommands: [
      ...new Set(
        input.ownedCommands
          .filter((command) => path.isAbsolute(command))
          .map((command) => path.resolve(command)),
      ),
    ].sort(),
    scope: {
      homeDir: path.resolve(input.homeDir),
      xdgConfigHome: path.resolve(
        input.env.XDG_CONFIG_HOME?.trim() ||
          path.join(input.homeDir, ".config"),
      ),
    },
  };

  const warnings: string[] = [];

  try {
    const old = await readRetiredFile(marker);

    if (old !== null) {
      let value: unknown;

      try {
        value = JSON.parse(old);
      } catch {}

      const parsed = markerSchema.safeParse(value);

      if (
        parsed.success &&
        JSON.stringify(parsed.data) === JSON.stringify(next)
      )
        return { complete: true, warnings };
    }

    const owned = { ...input, ownedCommands: next.ownedCommands };
    const repositories = await retireRepositoryHooks(owned);
    warnings.push(...repositories.warnings);
    warnings.push(...(await retireAgentHooks(owned)));

    if (!repositories.complete) return { complete: false, warnings };
    await writePrivateJsonAtomic(marker, next);

    return { complete: true, warnings };
  } catch (error) {
    return { complete: false, warnings: [...warnings, errorMessage(error)] };
  }
}
