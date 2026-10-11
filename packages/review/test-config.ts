import { fileURLToPath } from "node:url";

// Mirrors the `@review/*` and `@canvas/*` paths in tsconfig.base.json.
export const sourceAliases = {
  "@review": fileURLToPath(new URL("src", import.meta.url)),
  "@canvas": fileURLToPath(new URL("app/src", import.meta.url)),
};

export const reviewTestAliases = {
  ...sourceAliases,
  "@dev.fast/review-share-protocol": fileURLToPath(
    new URL("../review-share-protocol/src/index.ts", import.meta.url),
  ),
  "@dev.fast/json": fileURLToPath(
    new URL("../json/src/index.ts", import.meta.url),
  ),
  "@dev.fast/local-vcs": fileURLToPath(
    new URL("../local-vcs/src/index.ts", import.meta.url),
  ),
  "@dev.fast/review-protocol": fileURLToPath(
    new URL("../review-protocol/src/index.ts", import.meta.url),
  ),
};
