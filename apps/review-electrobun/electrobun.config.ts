import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Blackboard",
    identifier: "dev.fast.review.electrobun",
    version: "0.2.0",
  },
  build: {
    mainProcess: "cottontail",
    cottontail: { entrypoint: "src/main.ts" },
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    mac: {
      bundleCEF: true,
      defaultRenderer: "cef",
      icons: "../review-canvas/icons/review.iconset",
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
      icon: "../review-canvas/icons/review-square-512.png",
    },
    win: {
      bundleCEF: true,
      defaultRenderer: "cef",
      icon: "../review-canvas/icons/review.ico",
    },
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
