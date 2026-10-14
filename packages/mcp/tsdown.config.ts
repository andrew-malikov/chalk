import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts" },
  platform: "node",
  target: "esnext",
  format: "esm",
  outDir: "dist",
  fixedExtension: false,
  dts: { tsconfig: "../../tsconfig.mcp-build.json" },
  deps: {
    alwaysBundle: [
      /^@chalk\//,
      /^@dev\.fast\/diffr$/,
      /^isomorphic-git$/,
      /^micromark-extension-math$/,
    ],
    onlyBundle: false,
    neverBundle: ["typescript"],
  },
});
