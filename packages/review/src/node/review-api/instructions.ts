import { readFile } from "node:fs/promises";
import path from "node:path";

import { findPackageRoot } from "@review/node/package-paths.js";
import { z } from "zod";

export const INSTRUCTION_TOPICS = ["authoring", "file-lenses"] as const;

export type InstructionTopic = (typeof INSTRUCTION_TOPICS)[number];

export const instructionsQuerySchema = z.strictObject({
  topic: z.enum(INSTRUCTION_TOPICS).default("authoring"),
});

const cache = new Map<string, Promise<string>>();

function read(root: string, name: string): Promise<string> {
  const file = path.join(root, "instructions", `${name}.md`);
  let content = cache.get(file);

  if (!content) {
    content = readFile(file, "utf8").catch((error) => {
      cache.delete(file);
      throw error;
    });
    cache.set(file, content);
  }

  return content;
}

export function renderInstructions(
  topic: InstructionTopic,
  root = findPackageRoot(),
): Promise<string> {
  return read(root, topic);
}
