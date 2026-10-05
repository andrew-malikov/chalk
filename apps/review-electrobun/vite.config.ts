import path from "node:path";

import tailwindcss from "@tailwindcss/vite";

import { createReviewCanvasConfig } from "../../packages/review/app/desktop.vite.config";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

export default createReviewCanvasConfig({
  root: __dirname,
  plugins: [tailwindcss()],
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
