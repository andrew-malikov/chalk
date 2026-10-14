import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { "desktop-host": "src/desktop-host.ts" },
  platform: "node",
  target: "esnext",
  format: "esm",
  outDir: "runtime/dist",
  fixedExtension: false,
  dts: false,
  deps: {
    alwaysBundle: [
      /^@chalk\//,
      /^@dev\.fast\/diffr$/,
      /^isomorphic-git$/,
      /^micromark-extension-math$/,
      // Installed apps have no node_modules beside the host.
      /^hono(\/|$)/,
      /^zod$/,
    ],
    onlyBundle: false,
    neverBundle: ["typescript", /^bun:/],
  },
});
