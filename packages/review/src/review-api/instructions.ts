import { readFile } from "node:fs/promises";
import path from "node:path";

import { findReviewPackageRoot } from "@review/package-paths.js";
import { z } from "zod";

export const INSTRUCTION_TOPICS = [
  "authoring",
  "file-lenses",
  "scratchpad",
] as const;

export type InstructionTopic = (typeof INSTRUCTION_TOPICS)[number];

export const instructionsQuerySchema = z.strictObject({
  topic: z.enum(INSTRUCTION_TOPICS).default("authoring"),
});

export interface InstructionContext {
  desktopAvailable: boolean;
  scratchpadEnabled: boolean;
}

export function scratchpadAvailable(context: InstructionContext): boolean {
  return context.desktopAvailable && context.scratchpadEnabled;
}

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

export async function renderInstructions(
  topic: InstructionTopic,
  context: InstructionContext,
  root = findReviewPackageRoot(import.meta.url),
): Promise<string> {
  if (topic === "scratchpad" && !scratchpadAvailable(context)) {
    return "The Blackboard scratchpad is turned off or Blackboard Desktop is not running. Answer in chat; the scratchpad can be turned on in Blackboard Desktop Settings.";
  }

  if (topic !== "authoring") return read(root, topic);

  const more = [
    ...(scratchpadAvailable(context)
      ? [
          '- Explaining code visually outside a review: `session_get_instructions({topic:"scratchpad"})`',
        ]
      : []),
  ];

  return [
    await read(root, "authoring"),
    ...(more.length ? [`## More guidance\n\n${more.join("\n")}`] : []),
  ].join("\n\n");
}
