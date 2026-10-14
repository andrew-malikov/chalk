import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Chalk",
    identifier: "chalk.review.electrobun",
    version: process.env.CHALK_APP_VERSION || "0.2.0",
  },
  build: {
    mainProcess: "cottontail",
    cottontail: { entrypoint: "src/main.ts" },
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      runtime: "runtime",
    },
    mac: {
      codesign: Boolean(process.env.ELECTROBUN_DEVELOPER_ID),
      bundleCEF: true,
      defaultRenderer: "cef",
      icons: "../review-canvas/icons/chalk.iconset",
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
      icon: "../review-canvas/icons/chalk-square-512.png",
    },
    win: {
      bundleCEF: true,
      defaultRenderer: "cef",
      icon: "../review-canvas/icons/chalk.ico",
    },
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
