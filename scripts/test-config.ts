import { fileURLToPath } from "node:url";

// Mirrors the `@review/*` and `@canvas/*` paths in tsconfig.base.json.
export const sourceAliases = {
  "@chalk/tutorial/assets": fileURLToPath(
    new URL("../packages/tutorial/assets", import.meta.url),
  ),
  "@chalk/tutorial": fileURLToPath(
    new URL("../packages/tutorial/src", import.meta.url),
  ),
  "@chalk/server": fileURLToPath(
    new URL("../packages/server/src", import.meta.url),
  ),
  "@chalk/mcp": fileURLToPath(new URL("../packages/mcp/src", import.meta.url)),
  "@review": fileURLToPath(new URL("../packages/review/src", import.meta.url)),
  "@cli": fileURLToPath(new URL("../packages/cli/src", import.meta.url)),
  "@shell": fileURLToPath(
    new URL("../apps/review-electrobun/src", import.meta.url),
  ),
  "@canvas": fileURLToPath(
    new URL("../apps/review-canvas/src", import.meta.url),
  ),
};

export const workspaceTestAliases = {
  ...sourceAliases,
  "@chalk/json": fileURLToPath(
    new URL("../packages/json/src/index.ts", import.meta.url),
  ),
  "@chalk/local-vcs": fileURLToPath(
    new URL("../packages/local-vcs/src/index.ts", import.meta.url),
  ),
  "@chalk/review-contracts": fileURLToPath(
    new URL("../packages/review-contracts/src/index.ts", import.meta.url),
  ),
};
