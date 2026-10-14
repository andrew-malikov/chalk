import { fileURLToPath } from "node:url";

export function tutorialAssetsRoot(): string {
  return fileURLToPath(new URL("../assets", import.meta.url));
}
