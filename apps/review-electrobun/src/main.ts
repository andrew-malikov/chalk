import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import * as ApplicationMenu from "electrobun/main/app-menu";
import { BrowserView } from "electrobun/main/browser-view";
import { BrowserWindow } from "electrobun/main/browser-window";
import events from "electrobun/main/events";
import { RESOURCES_FOLDER } from "electrobun/main/paths";
import * as Utils from "electrobun/main/utils";
import { z } from "zod";

import {
  createQuitGate,
  externalURL,
  newWindowURL,
  openVSCode,
} from "./native";
import { createPreferencesStore } from "./preferences";
import type { AppRPC, HostState } from "./rpc";
import { startServer } from "./server-host";

const checkout = process.env.CHALK_REVIEW_CHECKOUT;

// Keep the existing dev profile so the rename preserves reviews and
// preferences; installed builds use the CLI's default home so it finds them.
const profile = path.resolve(
  process.env.CHALK_REVIEW_HOME ??
    (checkout
      ? path.join(homedir(), ".dev-fast/review-electrobun")
      : path.join(homedir(), ".chalk")),
);

const key = checkout
  ? `dev-electrobun-${createHash("sha256")
      .update(checkout)
      .digest("hex")
      .slice(0, 12)}`
  : "stable";

// Installed builds carry their own Bun and host, staged by scripts/dev.mjs.
const runtime = path.join(RESOURCES_FOLDER, "app/runtime");

const sidecar = checkout
  ? {
      runtimePath: process.env.REVIEW_ELECTROBUN_BUN,
      entry: process.env.CHALK_REVIEW_SERVER_ENTRY,
    }
  : {
      runtimePath: path.join(runtime, "bin/bun"),
      entry: path.join(runtime, "dist/desktop-host.js"),
    };

const appVersion: string = JSON.parse(
  readFileSync(path.join(RESOURCES_FOLDER, "version.json"), "utf8"),
).version;

const abort = new AbortController();

let state: HostState = { status: "starting", message: "Starting Chalk…" };

let preferences: Awaited<ReturnType<typeof createPreferencesStore>> | undefined;

let server: ReturnType<typeof startServer> | undefined;

events.on(
  "before-quit",
  createQuitGate(
    async () => {
      abort.abort();

      const results = await Promise.allSettled([
        server?.then((host) => host.stop()),
        preferences?.flush(),
      ]);

      for (const result of results)
        if (result.status === "rejected")
          console.error("Review shutdown", String(result.reason));
    },
    () => Utils.quit(),
  ),
);

async function run() {
  try {
    preferences = await createPreferencesStore(
      path.join(profile, "preferences.json"),
    );
  } catch (error) {
    state = { status: "error", message: String(error) };
  }

  if (abort.signal.aborted) return;

  const rpc = BrowserView.defineRPC<AppRPC>({
    handlers: {
      requests: {
        getState: () => state,
        setPreferences: async (patch) => {
          if (!preferences) throw new Error("Preferences are inaccessible.");
          const value = await preferences.update(patch);

          if (state.status === "ready")
            state = { ...state, preferences: value };

          return value;
        },
        openSource: openVSCode,
        openExternal: async (request) => {
          if (!Utils.openExternal(externalURL(request)))
            throw new Error("The system could not open this URL.");
        },
        focusWindow: (): void => {
          window.activate();
        },
      },
      messages: {
        diagnostic: (input) => {
          const value = z
            .strictObject({
              level: z.enum(["error", "warning"]),
              message: z.string().max(10000),
            })
            .parse(input);

          console.error(`Review renderer ${value.level}: ${value.message}`);
        },
      },
    },
  });

  const window = new BrowserWindow({
    title: "Chalk",
    url: "views://mainview/index.html",
    rpc,
    frame: { width: 1200, height: 850 },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
  });

  if (process.platform === "darwin") {
    // Center the 14px native controls in the shell's 56px header, and inset them
    // so the gap before them matches the gap to the sidebar icon in the 88px slot.
    window.setWindowButtonPosition(22, 21);
  }

  window.webview.setNavigationRules(["^*", "views://mainview/*"]);
  events.on(`new-window-open-${window.webview.id}`, (event) => {
    try {
      // SAFETY: the SDK emits data.detail on this per-view event; newWindowURL decodes and validates it.
      const { data } = event as {
        data: { detail: import("./native").NewWindowDetail };
      };

      Utils.openExternal(newWindowURL(data.detail));
    } catch (cause) {
      console.error("Cannot open external review link:", cause);
    }
  });

  function setState(next: HostState) {
    state = next;

    if (!abort.signal.aborted) rpc.send.hostState(next);
  }

  ApplicationMenu.setApplicationMenu([
    {
      label: "Chalk",
      submenu: [
        { label: "Settings…", action: "settings", accelerator: "CmdOrCtrl+," },
        { type: "divider" },
        { role: "quit", label: "Quit Chalk", accelerator: "CmdOrCtrl+Q" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "Toggle Sidebar",
          action: "toggleSidebar",
          accelerator: "CmdOrCtrl+Shift+B",
        },
        {
          label: "Close Review",
          action: "closeTab",
          accelerator: "CmdOrCtrl+W",
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "divider" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "divider" },
        { label: "Find", action: "find", accelerator: "CmdOrCtrl+F" },
      ],
    },
  ]);
  ApplicationMenu.on("application-menu-clicked", (event) => {
    // SAFETY: ApplicationMenu emits a data.action payload for authored menu items.
    const action = (event as { data?: { action?: string } }).data?.action;

    if (
      action === "find" ||
      action === "toggleSidebar" ||
      action === "settings" ||
      action === "closeTab"
    )
      rpc.send.command(action);
  });

  if (state.status === "error") return;

  if (!sidecar.runtimePath || !sidecar.entry) {
    setState({
      status: "error",
      message: "Launch this development app with Bun: bun dev",
    });

    return;
  }

  console.log(`Review profile: ${profile}; CHALK_REVIEW_INSTANCE=${key}`);
  server = startServer({
    profile,
    key,
    ...(checkout && { checkout }),
    appVersion,
    runtimePath: sidecar.runtimePath,
    entry: sidecar.entry,
    signal: abort.signal,
    onState: setState,
  });

  try {
    const host = await server;
    setState({
      status: "ready",
      discovery: host.discovery,
      preferences: preferences!.get(),
    });
    console.log(`Review server: ${host.discovery.url}`);
  } catch (error) {
    setState({ status: "error", message: String(error) });
  }
}

void run().catch((error) => console.error("Review startup", String(error)));
