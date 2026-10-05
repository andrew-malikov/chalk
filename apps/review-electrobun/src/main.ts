import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

import * as ApplicationMenu from "electrobun/main/app-menu";
import { BrowserView } from "electrobun/main/browser-view";
import { BrowserWindow } from "electrobun/main/browser-window";
import events from "electrobun/main/events";
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

const profile = path.resolve(
  process.env.DEV_REVIEW_HOME ??
    path.join(homedir(), ".dev-fast/review-electrobun"),
);

const checkout = process.env.DEV_FAST_REVIEW_CHECKOUT;

const key = `dev-electrobun-${createHash("sha256")
  .update(checkout ?? "")
  .digest("hex")
  .slice(0, 12)}`;

const appSessionId = randomUUID();

const abort = new AbortController();

let state: HostState = { status: "starting", message: "Starting Blackboard…" };

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
    title: "Blackboard",
    url: "views://mainview/index.html",
    rpc,
    frame: { width: 1200, height: 850 },
  });

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
      label: "Blackboard",
      submenu: [
        { label: "Settings…", action: "settings", accelerator: "CmdOrCtrl+," },
        { type: "divider" },
        { role: "quit", label: "Quit Blackboard" },
      ],
    },
    {
      label: "File",
      submenu: [
        { label: "Home", action: "home", accelerator: "CmdOrCtrl+Shift+H" },
        { label: "Close Tab", action: "closeTab", accelerator: "CmdOrCtrl+W" },
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
      action === "home" ||
      action === "settings" ||
      action === "closeTab"
    )
      rpc.send.command(action);
  });

  if (state.status === "error") return;

  if (
    !checkout ||
    !process.env.REVIEW_ELECTROBUN_BUN ||
    !process.env.DEV_FAST_REVIEW_SERVER_ENTRY
  ) {
    setState({
      status: "error",
      message: "Launch this development app with Bun: bun dev",
    });

    return;
  }

  console.log(`Review profile: ${profile}; DEV_REVIEW_INSTANCE=${key}`);
  server = startServer({
    profile,
    key,
    checkout,
    runtimePath: process.env.REVIEW_ELECTROBUN_BUN,
    entry: process.env.DEV_FAST_REVIEW_SERVER_ENTRY,
    signal: abort.signal,
    appSessionId,
    onState: setState,
  });

  try {
    const host = await server;
    setState({
      status: "ready",
      discovery: host.discovery,
      preferences: preferences!.get(),
      appSessionId,
    });
    console.log(`Review server: ${host.discovery.url}`);
  } catch (error) {
    setState({ status: "error", message: String(error) });
  }
}

void run().catch((error) => console.error("Review startup", String(error)));
