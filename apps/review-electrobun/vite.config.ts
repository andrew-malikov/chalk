import path from "node:path";

import { createReviewCanvasConfig } from "../review-canvas/desktop.vite.config";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

export default createReviewCanvasConfig({
  root: __dirname,
  resolve: {
    alias: [
      ...electrobunViteAliases(path.resolve(__dirname, ".hutch/devkit")),
      { find: "@shell", replacement: path.resolve(__dirname, "src") },
    ],
  },
  build: {
    outDir: "dist",
    rollupOptions: { input: path.resolve(__dirname, "index.html") },
  },
});
