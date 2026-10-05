import { describe, expect, it } from "vitest";

import {
  CLAUDE_WINDOWS_MCP_ADD,
  COPILOT_WINDOWS_MCP_ADD,
  connectPrompt,
  launchCommand,
  reviewMcpLaunch,
} from "./connect-prompts";
import { ALL_INSTALL_TARGETS } from "./install";

const input = {
  hasShim: true,
  legacyPaths: [],
  traceEnabled: false,
  fffBinaryPath: "/Users/u/.local/bin/fff-mcp",
  fffCorpusRoot: "/Users/u/.dev/trace-search",
};

describe("connectPrompt", () => {
  it("adds optional trace search only for supported harnesses when enabled", () => {
    for (const target of ALL_INSTALL_TARGETS) {
      const disabled = connectPrompt(target, input);
      const enabled = connectPrompt(target, { ...input, traceEnabled: true });
      expect(disabled).not.toContain(input.fffCorpusRoot);
      expect(disabled).not.toContain("npm:@ff-labs/pi-fff");

      const mcpTrace = target === "claude" || target === "codex";

      expect(enabled.includes(input.fffCorpusRoot)).toBe(mcpTrace);
      expect(enabled.includes(input.fffBinaryPath)).toBe(mcpTrace);
      expect(enabled.includes("pi install npm:@ff-labs/pi-fff")).toBe(
        target === "pi",
      );
      expect(enabled.includes("omp install npm:@ff-labs/pi-fff")).toBe(
        target === "omp",
      );
    }
  });

  it("registers the Claude plugin's MCP server directly on Windows instead of the plugin", () => {
    for (const [target, add] of [
      ["claude", CLAUDE_WINDOWS_MCP_ADD],
      ["copilot", COPILOT_WINDOWS_MCP_ADD],
    ] as const) {
      const prompt = connectPrompt(target, { ...input, platform: "win32" });

      expect(prompt).toContain(add);
      expect(prompt).not.toContain(`${target} plugin install`);
      expect(connectPrompt(target, { ...input, platform: "darwin" })).toContain(
        `${target} plugin install blackboard@devfast`,
      );
    }
  });

  it("registers the shared MCP launch in Pi, oh-my-pi and OpenCode", () => {
    for (const platform of ["darwin", "win32"] as const) {
      const launch = reviewMcpLaunch(true, platform);

      expect(connectPrompt("opencode", { ...input, platform })).toContain(
        `opencode mcp add --global blackboard -- ${launchCommand(launch)}\n`,
      );

      expect(connectPrompt("pi", { ...input, platform })).toContain(
        `pi mcp add blackboard -- ${launchCommand(launch)}\n`,
      );
      expect(connectPrompt("omp", { ...input, platform })).toContain(
        JSON.stringify({ blackboard: launch }, null, 2),
      );
    }
  });

  it("quotes the sh launch so Pi stores it unchanged", () => {
    expect(launchCommand(reviewMcpLaunch(true, "darwin"))).toBe(
      `sh -c 'exec "$HOME/.local/bin/blackboard" mcp'`,
    );
  });
});
