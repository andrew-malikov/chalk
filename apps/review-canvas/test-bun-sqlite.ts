import { createRequire } from "node:module";

// Vitest's jsdom loader loses named exports of bun:sqlite. Load the native
// module through require so canvas integration tests use the real database.
const sqlite: typeof import("bun:sqlite") = createRequire(import.meta.url)(
  "bun:sqlite",
);

export const Database = sqlite.Database;
