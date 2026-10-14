import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import {
  type CliInputStream,
  emitJsonEvent,
  humanStream,
  jsonRequestedInArgv,
} from "@cli/cli-output";
import {
  emitReviewEvent,
  serializeReviewError,
} from "@cli/diagnostics/review-logger";
import { setTraceAttribute } from "@cli/diagnostics/startup-trace";
import {
  isOwnedShim,
  pathShimPath,
  windowsInstallerCommand,
} from "@review/node/cli-install";
import { connectPrompts } from "@review/node/connect-prompts";
import {
  readReviewInstances,
  selectReviewInstance,
} from "@review/node/desktop-discovery";
import {
  ALL_INSTALL_TARGETS,
  type InstallTarget,
  isInstallTarget,
} from "@review/node/install";
import { processIsAlive } from "@review/node/lib/with-file-lock";
import {
  findPackageRoot,
  readPackageVersion,
} from "@review/node/package-paths";
import {
  type ReviewAppLaunchEvent,
  runReviewAppLaunch,
} from "@review/node/review-app-launcher";
import { runReviewInfo } from "@review/node/review-info";
import {
  readReviewServerDiscovery,
  readReviewServerHealth,
  reviewServerIsHealthy,
  reviewServerStateDir,
  serverNotReady,
} from "@review/node/server-discovery";
import { DEV_REVIEW_HOME_ENV } from "@review/node/storage/review-home-paths";
import { Argument, Command, CommanderError, Option } from "commander";

import { reviewAgentCliHelp } from "./agent-cli";
import { cliRuntimeInfo, describeCliRuntime } from "./cli-runtime-info";
import { type ReviewAppEvent, runReviewAppPick } from "./review-app";
import {
  clearReviewInstance,
  listReviewInstancesCommand,
  useReviewInstance,
} from "./review-instances";

interface ReviewCliRuntime {
  runReviewAppLaunch: typeof runReviewAppLaunch;
  runReviewAppPick: typeof runReviewAppPick;
  runReviewInfo: typeof runReviewInfo;
}

export interface ReviewCliInput {
  argv: string[];
  cliVersion?: string;
  cliPaths?: { requestedPath: string; effectivePath: string };
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: CliInputStream;
  stdout: Writable;
  stderr: Writable;
  runtime?: Partial<ReviewCliRuntime>;
}

interface ReviewInfoOptions {
  all?: boolean;
  session?: string;
}

type OutputSurface = "review" | "plain";

interface CliRunState {
  exitCode: number;
  parseSurface: OutputSurface;
  parserErrorOutput: string;
  json: boolean;
}

export async function runReviewCli(input: ReviewCliInput): Promise<number> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? env.INIT_CWD ?? process.cwd();

  const cliVersion = input.cliVersion ?? readPackageVersion(import.meta.url);

  const runtime = reviewCliRuntime(input.runtime);

  const state: CliRunState = {
    exitCode: 0,
    parseSurface: "review",
    parserErrorOutput: "",
    json: jsonRequestedInArgv(input.argv),
  };

  const configureOutput = <T extends Command>(
    command: T,
    surface: OutputSurface,
  ): T => {
    command.configureOutput({
      writeOut: (message) => input.stdout.write(message),
      writeErr: (message) => {
        state.parseSurface = surface;
        state.parserErrorOutput += message;
      },
    });
    command.showHelpAfterError();

    return command;
  };

  // Every command accepts --json so an agent can pass it without first knowing
  // which commands support it. Commands that already write only JSON to stdout
  // treat it as a no-op; the rest switch stdout to events and push human
  // progress to stderr. A factory, not one shared Option: a shared instance
  // would propagate any later .default()/.conflicts() to every command.
  const configureJsonOutput = <T extends Command>(
    command: T,
    surface: OutputSurface,
  ): T =>
    configureOutput(command, surface).addOption(
      new Option("--json", "print machine-readable JSON events on stdout"),
    );

  const program = configureOutput(new Command(), "review")
    .name("blackboard")
    .enablePositionalOptions()
    .version(cliVersion)
    .description("Create and open dev.fast reviews.")
    .addHelpText("after", reviewTopLevelHelp());

  // Tolerate the leading form (`blackboard --json scaffold`) as well as the usual
  // trailing one. Never give this a .default(): optsWithGlobals merges globals
  // over locals, so a default would clobber a subcommand's own true.
  program.addOption(new Option("--json").hideHelp());
  program.option(
    "--state-dir <path>",
    "select headless Blackboard state for server, api, and mcp",
  );
  program.exitOverride();

  const authoringEnv = (
    stateDir = program.opts<{ stateDir?: string }>().stateDir,
  ) =>
    stateDir
      ? { ...env, DEV_REVIEW_SERVER_DIR: path.resolve(cwd, stateDir) }
      : env;

  const serverCommand = configureOutput(
    program
      .command("server")
      .description("Run review authoring without Desktop"),
    "plain",
  );

  configureJsonOutput(
    serverCommand
      .command("start")
      .description(
        "Start the foreground authoring server; stop with Ctrl-C or SIGTERM",
      )
      .option(
        "--state-dir <path>",
        "directory for saved reviews and server discovery",
      )
      .option(
        "--port <port>",
        "loopback port (0 chooses an available port)",
        "0",
      )
      .option(
        "--software-maps",
        "allow the authoring skill to generate optional software maps",
      )
      // Batch authoring was removed; name that instead of "unknown option".
      .addOption(new Option("--authoring-mode <mode>").hideHelp()),
    "plain",
  ).action(async (_options, command: Command) => {
    const options = command.optsWithGlobals<{
      stateDir?: string;
      port: string;
      softwareMaps?: boolean;
      authoringMode?: string;
      json?: boolean;
    }>();

    if (options.authoringMode !== undefined)
      throw new Error(
        "--authoring-mode was removed with batch authoring; the server always authors interactively. Drop the option.",
      );
    const port = Number(options.port);

    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("--port must be an integer between 0 and 65535.");
    const stateDir = reviewServerStateDir(authoringEnv(options.stateDir));
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    try {
      const { runHeadlessServer } =
        await import("@blackboard/server/headless-host.js");

      await runHeadlessServer({
        stateDir,
        port,
        softwareMapEnabled: options.softwareMaps,
        signal: controller.signal,
        onReady: ({ url, serverPid }) => {
          input.stdout.write(
            options.json
              ? `${JSON.stringify({ event: "server.ready", url, serverPid, stateDir })}\n`
              : `Blackboard server ready at ${url}\nSaved reviews: ${stateDir}\n`,
          );
        },
      });
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
  });

  configureJsonOutput(
    serverCommand
      .command("status")
      .description("Check whether the headless server is ready")
      .option(
        "--state-dir <path>",
        "directory selected when starting the server",
      ),
    "plain",
  ).action(async (_options, command: Command) => {
    const options = command.optsWithGlobals<{
      stateDir?: string;
      json?: boolean;
    }>();

    const stateDir = reviewServerStateDir(authoringEnv(options.stateDir));
    const discovery = await readReviewServerDiscovery(stateDir);
    const health = discovery && (await readReviewServerHealth(discovery));

    if (!discovery || !health) throw serverNotReady(stateDir);
    const { url, serverPid } = discovery;
    const { version, serverId } = health;
    input.stdout.write(
      options.json
        ? `${JSON.stringify({ event: "server.status", ready: true, url, serverPid, stateDir, version, serverId })}\n`
        : `Blackboard server ready at ${url}\nSaved reviews: ${stateDir}\n`,
    );
  });

  configureJsonOutput(
    serverCommand
      .command("reset-id")
      .description(
        "Give this machine's saved reviews a new server id; stop the server first",
      )
      .option(
        "--state-dir <path>",
        "directory selected when starting the server",
      ),
    "plain",
  ).action(async (_options, command: Command) => {
    const options = command.optsWithGlobals<{
      stateDir?: string;
      json?: boolean;
    }>();

    const stateDir = reviewServerStateDir(authoringEnv(options.stateDir));

    if (!existsSync(path.join(stateDir, "review-api.db")))
      throw new Error(
        `No saved reviews in ${stateDir}, so there is no server id to reset. Check --state-dir.`,
      );

    // Any live Desktop holds the store, attached window or not. Only a gone
    // process counts as stopped: a paused or busy one may not answer /health.
    const desktops = await readReviewInstances({
      env: { ...env, [DEV_REVIEW_HOME_ENV]: stateDir },
    });

    const [problem] = desktops.broken.values();

    if (problem)
      throw new Error(
        `Cannot tell whether a Blackboard Desktop is using ${stateDir}: ${problem.message}`,
      );

    const inUse = () =>
      new Error(
        `A Blackboard server is using ${stateDir}. Stop it first, then run blackboard server reset-id again.`,
      );

    if (
      desktops.instances.some(({ discovery }) =>
        [discovery.appPid, discovery.serverPid].some((pid) =>
          processIsAlive(pid),
        ),
      )
    )
      throw inUse();

    const [{ openReviewProfile }, { withHeadlessServerLock }] =
      await Promise.all([
        import("@review/node/review-api/profile.js"),
        import("@blackboard/server/headless-host.js"),
      ]);

    // The headless server's own lock (at the path it resolves): refused while
    // a live server holds it, and no server can start during the reset.
    const reset = await withHeadlessServerLock(
      await realpath(stateDir),
      async () => {
        const local = await openReviewProfile(stateDir, {
          manageWorkspaces: false,
        });

        try {
          return local.store.resetServerId();
        } finally {
          await local.data.close();
          await local.store.close();
        }
      },
    );

    if (!reset.acquired) throw inUse();
    const serverId = reset.result;

    input.stdout.write(
      options.json
        ? `${JSON.stringify({ event: "server.reset-id", serverId, stateDir })}\n`
        : `New server id ${serverId}\nSaved reviews: ${stateDir}\n`,
    );
  });

  configureJsonOutput(
    program
      .command("version")
      .description("Print Blackboard package version")
      .option("--verbose", "Show executing CLI paths and build identity"),
    "plain",
  ).action(async (options: { verbose?: boolean }, command: Command) => {
    const { json } = command.optsWithGlobals<{ json?: boolean }>();

    if (options.verbose) {
      const selection = await selectReviewInstance({ env });

      const info = {
        ...cliRuntimeInfo(
          input.cliPaths?.requestedPath ??
            path.resolve(process.argv[1] ?? fileURLToPath(import.meta.url)),
          input.cliPaths?.effectivePath,
        ),
        instance: selection.key,
        instanceRecord: selection.instance?.filePath ?? null,
      };

      input.stdout.write(
        json
          ? `${JSON.stringify(info)}\n`
          : `${describeCliRuntime(info)}Instance: ${info.instance} (${info.instanceRecord ?? "not running"})\n`,
      );
      state.exitCode = 0;

      return;
    }

    input.stdout.write(
      json
        ? `${JSON.stringify({ event: "version", version: cliVersion })}\n`
        : `${cliVersion}\n`,
    );
    state.exitCode = 0;
  });

  const writeAppEvent = (
    event: ReviewAppLaunchEvent | ReviewAppEvent,
    options: { json?: boolean; focus?: boolean },
  ) => {
    if (options.json) {
      input.stdout.write(`${JSON.stringify(event)}\n`);
    } else if (event.action === "launch") {
      input.stdout.write(
        event.state === "running"
          ? "Blackboard Desktop is already running.\n"
          : options.focus
            ? "Blackboard Desktop is ready.\n"
            : "Blackboard Desktop is ready in the background. Pass --focus to bring it forward.\n",
      );
    } else {
      input.stdout.write(`Blackboard Desktop is showing "${event.title}".\n`);
    }
  };

  const pickReview = async (options: {
    session?: string;
    focus?: boolean;
    json?: boolean;
  }) => {
    // SAFETY: the picker reads keypresses only after checking isTTY, and only
    // a tty.ReadStream reports isTTY; any other stream fails that check first.
    const event = await runtime.runReviewAppPick({
      cwd,
      reviewUuid: options.session,
      focus: options.focus,
      stdin: (input.stdin ?? process.stdin) as NodeJS.ReadStream,
      // This stream carries only the interactive picker. Under --json it must
      // not be stdout: the picker's ANSI frames would corrupt the event line.
      stdout: humanStream({ ...input, json: options.json }),
    });

    if (!event) {
      state.exitCode = 1;

      return;
    }

    writeAppEvent(event, options);
    state.exitCode = 0;
  };

  const launchApp = async (options: {
    focus?: boolean;
    json?: boolean;
    sandbox?: boolean;
  }) => {
    const event = await runtime.runReviewAppLaunch({
      focus: options.focus,
      noSandbox: options.sandbox === false,
    });

    writeAppEvent(event, options);
    state.exitCode = 0;
  };

  const app = configureJsonOutput(
    program
      .command("app")
      .description("Start Blackboard Desktop in the background")
      .option("--focus", "bring Blackboard Desktop to the foreground")
      .option(
        "--no-sandbox",
        "disable the Chromium sandbox for a Linux container",
      ),
    "plain",
  ).action(launchApp);

  configureJsonOutput(
    app
      .command("launch")
      .description("Start Blackboard Desktop in the background")
      .option("--focus", "bring Blackboard Desktop to the foreground")
      .option(
        "--no-sandbox",
        "disable the Chromium sandbox for a Linux container",
      ),
    "plain",
  ).action(launchApp);
  configureJsonOutput(
    app
      .command("pick")
      .description("Select a review (interactive picker without --session)")
      .option("--session <uuid>", "review UUID")
      .option("--focus", "bring Blackboard Desktop to the foreground"),
    "plain",
  ).action(pickReview);

  const instanceOutput = (command: Command) => ({
    env,
    stdout: input.stdout,
    stderr: input.stderr,
    json: command.optsWithGlobals<{ json?: boolean }>().json,
  });

  const instances = configureJsonOutput(
    program
      .command("instances")
      .description("List running reviews and the one commands use"),
    "plain",
  ).action(async (_options: { json?: boolean }, command: Command) => {
    await listReviewInstancesCommand(instanceOutput(command));
    state.exitCode = 0;
  });

  configureJsonOutput(
    instances
      .command("use")
      .description("Make an instance this machine's default")
      .argument("<key>", "stable, preview, or a dev-… key"),
    "plain",
  ).action(
    async (key: string, _options: { json?: boolean }, command: Command) => {
      await useReviewInstance(key, instanceOutput(command));
      state.exitCode = 0;
    },
  );

  configureJsonOutput(
    instances.command("clear").description("Remove the machine default"),
    "plain",
  ).action(async (_options: { json?: boolean }, command: Command) => {
    await clearReviewInstance(instanceOutput(command));
    state.exitCode = 0;
  });

  configureJsonOutput(
    program.command("info").description("Print review information"),
    "plain",
  )
    .option("--all", "list active reviews for every worktree in this repo")
    .addOption(
      new Option("--session <uuid>", "select a review").conflicts("all"),
    )
    .action(async (options: ReviewInfoOptions) => {
      const event = await runtime.runReviewInfo({
        cwd,
        all: options.all,
        reviewUuid: options.session,
      });

      input.stdout.write(`${JSON.stringify(event)}\n`);
      state.exitCode = 0;
    });

  const connect = configureJsonOutput(
    program
      .command("connect")
      .description(
        "Print the prompt that connects a coding agent to Blackboard",
      )
      .addArgument(
        new Argument("[target...]", "coding agent").choices([
          "claude",
          "claude-code",
          "codex",
          "opencode",
          "pi",
          "omp",
          "copilot",
          "all",
        ]),
      ),
    "plain",
  );

  connect.action(async (targets: string[], options: { json?: boolean }) => {
    const selected = parseTargets(targets);

    const homeDir = env.HOME || os.homedir();

    const prompts = connectPrompts({
      hasShim:
        (await isOwnedShim(pathShimPath(homeDir))) ||
        (await windowsInstallerCommand(
          findPackageRoot(import.meta.url),
          env,
        )) !== undefined,
    });

    const output = {
      json: options.json,
      stdout: input.stdout,
      stderr: input.stderr,
    };

    if (options.json) {
      emitJsonEvent(output, {
        event: "connect",
        prompts: Object.fromEntries(
          selected.map((target) => [target, prompts[target]]),
        ),
      });

      return;
    }

    const sections = selected.map((target) =>
      selected.length > 1
        ? `## ${TARGET_LABELS[target]}\n\n${prompts[target]}`
        : prompts[target],
    );

    humanStream(output).write(`${sections.join("\n\n")}\n`);
  });

  // The JSON authoring surface is owned by agent-cli.ts. Commander
  // passes the tool name and JSON payload through untouched, so these commands
  // share the top-level help and the leading `--json` form without a separate
  // parser.
  for (const [name, description] of [
    ["api", "Call a JSON review authoring tool on the running server"],
    ["mcp", "Serve the JSON review authoring tools over stdio MCP"],
  ] as const) {
    configureOutput(
      program
        .command(name)
        .description(description)
        .argument("[args...]", "tool name and JSON input")
        .allowUnknownOption()
        .allowExcessArguments()
        .helpOption(false)
        .passThroughOptions()
        .addHelpText("after", `\n${reviewAgentCliHelp}`),
      "plain",
    ).action(async (args: string[]) => {
      const { runReviewAgentCli } = await import("./agent-cli.js");

      state.exitCode = await runReviewAgentCli({
        ...input,
        env: authoringEnv(),
        argv: [name, ...args],
      });
    });
  }

  program.hook("preAction", (_command, actionCommand) => {
    // The parsed option is authoritative once parsing succeeds. The argv scan
    // that seeded state.json only has to cover parse failures.
    if (actionCommand.optsWithGlobals().json === true) {
      state.json = true;
    }

    const command = [actionCommand.parent?.name(), actionCommand.name()]
      .filter((name) => name && name !== program.name())
      .join(".");

    setTraceAttribute("command", command);
  });

  try {
    await program.parseAsync(input.argv, { from: "user" });

    return state.exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) {
        return 0;
      }

      const surface = state.parseSurface;

      // stdout carries the parseable failure whenever the caller asked for
      // JSON; stderr keeps the commander message and the help that
      // showHelpAfterError() produced, because a human may be reading too.
      if (state.json || surface === "review") {
        emitReviewEvent(input.stdout, {
          event: "error",
          error: {
            name: "ReviewCliUsageError",
            message: commanderErrorMessage(error),
          },
        });
      }

      if (surface !== "review") {
        input.stderr.write(
          state.parserErrorOutput || ensureTrailingNewline(error.message),
        );
      }

      return 1;
    }

    if (state.json) {
      const serialized: ReturnType<typeof serializeReviewError> & {
        code?: string;
        remedy?: string;
      } = serializeReviewError(error);

      emitReviewEvent(input.stdout, { event: "error", error: serialized });
    } else {
      input.stderr.write(ensureTrailingNewline(formatCliError(error)));
    }

    return 1;
  }
}

const TARGET_LABELS: Record<InstallTarget, string> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  pi: "Pi",
  omp: "oh-my-pi",
  copilot: "Copilot CLI",
};

function parseTargets(targets: readonly string[]): InstallTarget[] {
  if (targets.length === 0 || targets.includes("all")) {
    return [...ALL_INSTALL_TARGETS];
  }

  return [
    ...new Set(
      targets
        .values()
        .map((target) => (target === "claude-code" ? "claude" : target))
        .filter(isInstallTarget),
    ),
  ];
}

function reviewCliRuntime(
  overrides: Partial<ReviewCliRuntime> | undefined,
): ReviewCliRuntime {
  return {
    runReviewAppLaunch,
    runReviewAppPick,
    runReviewInfo,

    ...overrides,
  };
}

function reviewTopLevelHelp(): string {
  return [
    "",
    "Use `blackboard info` to discover review documents for this checkout.",
    "Reviews are authored through the JSON API: `blackboard api tools` lists the tools, and `blackboard mcp` serves the same catalog to an agent.",
    "Use `blackboard app launch` to start Blackboard Desktop. Use `blackboard app pick --session <uuid>` to open one.",
    "Use `blackboard server start` for headless authoring, and `blackboard server status --json` to check readiness.",
    "",
    "Every command accepts --json. Stdout then carries only JSON events, one per line,",
    "human progress moves to stderr, and a failure prints a JSON error event too.",
    "",
    "Example agent prompt (for a repository that provides a CI/CD system):",
    "",
    "  Can you use Blackboard to explain this repository's CI/CD system to me?",
    "",
    "  My current understanding:",
    "",
    "  1. CI/CD can be configured entirely in JavaScript. There is no YAML;",
    "     everything is code.",
    "  2. I expect it to look somewhat like Dagger, where user-authored code",
    "     makes RPC-style calls into a build system.",
    "",
    "  I have a lot of questions, so please start at a high level:",
    "",
    "  1. Give me a two-sentence introduction, followed by two or three goals",
    "     and non-goals for the repository.",
    "  2. Explain the CI/CD APIs it exposes and how a user would use them.",
    "  3. Show sequence diagrams for the main user flows, including setting up",
    "     a pipeline and pushing a change.",
    "  4. Show database views for the Cloudflare D1 and Worker access patterns,",
    "     with walkthroughs linked to the relevant code.",
    "",
    "  Start concise and let me dig deeper through the canvas.",
  ].join("\n");
}

function commanderErrorMessage(error: CommanderError): string {
  return error.message.replace(/^error:\s*/i, "");
}

function formatCliError(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.stack || `${cause.name}: ${cause.message}`;
  }

  return String(cause);
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
