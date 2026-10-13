import type { InstallTarget } from "./install";

/** The macOS and Linux launch form; the Claude plugin must match it byte for byte, and the Codex plugin's bin/blackboard-mcp runs the same command. */
export const REVIEW_MCP_LAUNCH = {
  command: "sh",
  args: ["-c", 'exec "$HOME/.local/bin/blackboard" mcp'],
} as const;

/**
 * Windows has no sh, and Node-based harnesses cannot start a .cmd file
 * directly. cmd finds blackboard.cmd on PATH, whether the first-run step or
 * the installer put it there.
 */
export const WINDOWS_MCP_LAUNCH = {
  command: "cmd",
  args: ["/d", "/c", "blackboard", "mcp"],
} as const;

export interface ConnectPromptInput {
  /** False when the serving package has no built CLI (Desktop from source): prompts fall back to a bare `blackboard`. */
  hasShim: boolean;

  /** Defaults to this process's platform. */
  platform?: NodeJS.Platform;
}

export const PI_BLACKBOARD_PACKAGE = "npm:@blackboard/pi-blackboard";

/** A stdio MCP server launch, as harness configs spell it. */
export interface McpLaunch {
  command: string;
  args: string[];
}

export function reviewMcpLaunch(
  hasShim: boolean,
  platform: NodeJS.Platform = process.platform,
): McpLaunch {
  if (platform === "win32")
    return {
      command: WINDOWS_MCP_LAUNCH.command,
      args: [...WINDOWS_MCP_LAUNCH.args],
    };

  return hasShim
    ? {
        command: REVIEW_MCP_LAUNCH.command,
        args: [...REVIEW_MCP_LAUNCH.args],
      }
    : { command: "blackboard", args: ["mcp"] };
}

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function numbered(steps: string[]): string[] {
  return steps.map((step, index) => `${index + 1}. ${step}`);
}

/** The Claude plugin's sh launch cannot start on Windows, so register the server directly. */
export const CLAUDE_WINDOWS_MCP_ADD = `claude mcp add -s user blackboard -- ${WINDOWS_MCP_LAUNCH.command} ${WINDOWS_MCP_LAUNCH.args.join(" ")}`;

/** Copilot CLI loads the Claude plugin, so on Windows it too registers the server directly. */
export const COPILOT_WINDOWS_MCP_ADD = `copilot mcp add blackboard -- ${WINDOWS_MCP_LAUNCH.command} ${WINDOWS_MCP_LAUNCH.args.join(" ")}`;

function pluginSteps(
  target: InstallTarget,
  platform: NodeJS.Platform,
): string[] {
  switch (target) {
    case "claude":
      if (platform === "win32")
        return [
          `Run:\n\n\`\`\`sh\nclaude plugin uninstall blackboard@devfast # its launch cannot start on Windows, if installed\nclaude mcp remove -s user blackboard # old registration, if any\n${CLAUDE_WINDOWS_MCP_ADD}\n\`\`\``,
        ];

      return [
        "Run:\n\n```sh\nclaude plugin marketplace add devdotfast/whiteboard\nclaude plugin install blackboard@devfast --scope user\nclaude mcp remove -s user blackboard # old manual registration, if any\n```",
      ];
    case "codex":
      return [
        "Run:\n\n```sh\ncodex plugin marketplace add devdotfast/whiteboard\ncodex plugin add blackboard@devfast\ncodex mcp remove blackboard # old manual registration, if any\n```",
      ];
    case "opencode": {
      const launch = reviewMcpLaunch(true, platform);

      const entry = JSON.stringify(
        {
          blackboard: {
            type: "local",
            command: [launch.command, ...launch.args],
          },
        },
        null,
        2,
      );

      return [
        `On OpenCode 2.0 or later, run:\n\n\`\`\`sh\nopencode mcp add --global blackboard -- ${launchCommand(launch)}\n\`\`\`\n\nOn older OpenCode, add this entry to "mcp" in ~/.config/opencode/opencode.json, keeping the rest of the file:\n\n\`\`\`json\n${entry}\n\`\`\``,
        `Remove "@dev.fast/opencode-whiteboard" from "plugin" in ~/.config/opencode/opencode.json if it is there.`,
      ];
    }

    case "copilot":
      if (platform === "win32")
        return [
          `Run:\n\n\`\`\`sh\ncopilot plugin uninstall blackboard@devfast # its launch cannot start on Windows, if installed\ncopilot mcp remove blackboard # old registration, if any\n${COPILOT_WINDOWS_MCP_ADD}\n\`\`\``,
        ];

      return [
        "Run:\n\n```sh\ncopilot plugin marketplace add devdotfast/whiteboard\ncopilot plugin install blackboard@devfast\ncopilot mcp remove blackboard # old manual registration, if any\n```",
      ];
    case "pi":
      return [
        `On Pi 0.99.0 or later, run:\n\n\`\`\`sh\npi mcp add blackboard -- ${launchCommand(reviewMcpLaunch(true, platform))}\npi remove ${PI_BLACKBOARD_PACKAGE} # if installed\n\`\`\`\n\nOn older Pi, run \`pi install ${PI_BLACKBOARD_PACKAGE}\`.`,
      ];
    case "omp": {
      const entry = JSON.stringify(
        { blackboard: reviewMcpLaunch(true, platform) },
        null,
        2,
      );

      return [
        `Add this entry to mcpServers in ~/.omp/agent/mcp.json, keeping the rest of the file:\n\n\`\`\`json\n${entry}\n\`\`\``,
        `Run \`omp plugin uninstall @dev.fast/pi-whiteboard\` if installed.`,
      ];
    }
  }
}

export function launchCommand(launch: McpLaunch): string {
  return [launch.command, ...launch.args]
    .map((arg) => (/^[\w./-]+$/.test(arg) ? arg : shellQuote(arg)))
    .join(" ");
}

export function connectPrompt(
  target: InstallTarget,
  input: ConnectPromptInput,
): string {
  if (!input.hasShim) {
    return "Connect this agent to dev.fast Blackboard.\n\nStop and ask me to install the blackboard command in Blackboard Desktop (Settings → Command line), then run this connect command again. The connection requires ~/.local/bin/blackboard.";
  }

  const verify =
    target === "pi"
      ? "Ask me to run /reload, then call `session_get_instructions` on the Blackboard server (older Pi: `blackboard api session_get_instructions '{}'`). Do not author anything yet."
      : target === "omp"
        ? "Ask me to run /mcp reload, then call `session_get_instructions` on the Blackboard server. Do not author anything yet."
        : target === "opencode"
          ? "Stop and tell me to quit and reopen OpenCode: it loads MCP servers only at startup. After I reopen it, call `session_get_instructions` on the Blackboard server to confirm the connection. Do not author anything yet."
          : "Reload your MCP tools and call `session_get_instructions` on the Blackboard server. If a restart is needed, tell me and verify after it. Do not author anything yet.";

  return [
    "Connect this agent to dev.fast Blackboard.",
    "",
    ...numbered([
      ...pluginSteps(target, input.platform ?? process.platform),
      verify,
    ]),
  ].join("\n");
}

export function connectSetupPrompt(target: InstallTarget): string {
  return `Run \`blackboard connect ${target}\` and follow the instructions to connect this agent to Blackboard.`;
}

export function connectSetupPrompts(): Record<InstallTarget, string> {
  return {
    claude: connectSetupPrompt("claude"),
    codex: connectSetupPrompt("codex"),
    opencode: connectSetupPrompt("opencode"),
    pi: connectSetupPrompt("pi"),
    omp: connectSetupPrompt("omp"),
    copilot: connectSetupPrompt("copilot"),
  };
}

export function connectPrompts(
  input: ConnectPromptInput,
): Record<InstallTarget, string> {
  return {
    claude: connectPrompt("claude", input),
    codex: connectPrompt("codex", input),
    opencode: connectPrompt("opencode", input),
    pi: connectPrompt("pi", input),
    omp: connectPrompt("omp", input),
    copilot: connectPrompt("copilot", input),
  };
}
