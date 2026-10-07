import type {
  ReviewDesktopDiscovery,
  ReviewDiffLayout,
  ReviewInlineEditorRange,
} from "@dev.fast/review-protocol";
import {
  REVIEW_KEYMAP_CHOICES,
  REVIEW_TUTORIAL_STEP_IDS,
} from "@dev.fast/review-protocol";
import { z } from "zod";

export const preferencesSchema = z.strictObject({
  sidebarHidden: z.boolean().default(false),
  theme: z.enum(["system", "light", "dark"]),
  diffLayout: z.enum(["split", "unified"]),
  defaultDiffMode: z.enum(["text", "structural"]).default("text"),
  reviewIds: z.array(z.string().min(1)),
  activeReviewId: z.string().min(1).nullable(),
  keymap: z.enum(REVIEW_KEYMAP_CHOICES).default("none"),
  tutorialProgress: z
    .strictObject({
      version: z.literal(1),
      checked: z.array(z.enum(REVIEW_TUTORIAL_STEP_IDS)),
      dismissed: z.boolean(),
    })
    .default(() => ({ version: 1 as const, checked: [], dismissed: false })),
});

export type ShellPreferences = z.infer<typeof preferencesSchema>;

export const defaultPreferences: ShellPreferences = {
  sidebarHidden: false,
  theme: "system",
  diffLayout: "split",
  defaultDiffMode: "text",
  reviewIds: [],
  activeReviewId: null,
  keymap: "none",
  tutorialProgress: { version: 1, checked: [], dismissed: false },
};

export type HostState =
  | { status: "starting"; message?: string }
  | {
      status: "ready";
      discovery: ReviewDesktopDiscovery;
      preferences: ShellPreferences;
      appSessionId: string;
    }
  | { status: "error" | "disconnected"; message: string };

export type NativeOpenRequest =
  | { kind: "workspace"; workspacePath: string }
  | {
      kind: "file";
      workspacePath: string;
      filePath: string;
      range?: ReviewInlineEditorRange;
    }
  | {
      kind: "diff";
      workspacePath: string;
      originalPath: string;
      modifiedPath: string;
    };

export type ShellCommand = "find" | "toggleSidebar" | "settings" | "closeTab";

export type AppRPC = {
  bun: {
    requests: {
      getState: { params: void; response: HostState };
      setPreferences: {
        params: Partial<ShellPreferences>;
        response: ShellPreferences;
      };
      openSource: { params: NativeOpenRequest; response: void };
      openExternal: { params: { url: string }; response: void };
      focusWindow: { params: void; response: void };
    };
    messages: { diagnostic: { level: "error" | "warning"; message: string } };
  };
  webview: {
    requests: {};
    messages: { hostState: HostState; command: ShellCommand };
  };
};

export type AppRPCClient = {
  request: {
    [K in keyof AppRPC["bun"]["requests"]]: (
      params: AppRPC["bun"]["requests"][K]["params"],
    ) => Promise<AppRPC["bun"]["requests"][K]["response"]>;
  };
  send: {
    diagnostic: (message: AppRPC["bun"]["messages"]["diagnostic"]) => void;
  };
};

export type DiffLayout = ReviewDiffLayout;
