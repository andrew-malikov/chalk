import { fileURLToPath } from "node:url";

import { createReviewCanvasConfig } from "../../apps/review-canvas/desktop.vite.config";
import { workspaceTestAliases } from "../../scripts/test-config";

export default createReviewCanvasConfig({
  root: fileURLToPath(new URL("./harness", import.meta.url)),
  resolve: { alias: workspaceTestAliases },
  server: { host: "127.0.0.1", port: 4175, strictPort: true },
});
