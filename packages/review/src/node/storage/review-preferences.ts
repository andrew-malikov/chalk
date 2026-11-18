import { readFile } from "node:fs/promises";
import path from "node:path";

import { isJsonObject, parseJsonText } from "@chalk/review-contracts";

import { chalkHome } from "./chalk-paths";

/**
 * Whether the scratchpad exists on this machine. Off, the server neither
 * makes nor lists it and Review's instructions do not offer it to agents.
 * A missing or unreadable preferences file means off.
 */
export async function readScratchpadEnabled(
  devHome = chalkHome(),
): Promise<boolean> {
  try {
    const raw = parseJsonText(
      await readFile(path.join(devHome, "preferences.json"), "utf8"),
    );

    return isJsonObject(raw) && raw.scratchpadEnabled === true;
  } catch {
    return false;
  }
}
