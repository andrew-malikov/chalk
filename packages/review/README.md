# Chalk

The `@chalk/review` package provides the `chalk` CLI for headless review
authoring and agent trace capture. It requires Bun 1.4.2 or newer. An npm install
also provides `review` and `whiteboard` as aliases for `chalk`.
`chalk server` and `chalk trace` run without installing or starting Desktop.
Chalk Desktop displays the review canvas; its server owns review
discovery, session state, and presentation. Legacy reviews
published with the removed MDX toolchain have a durable UUID directory under
`${DEV_REVIEW_HOME:-~/.dev}/reviews/<uuid>/` and are imported into the JSON
store when Home lists them or when they are opened.

## Workspace packages

- `@chalk/review`: Bun runtime, CLI, and authoring tools. Its
  production dependencies are the external libraries used by the compiled Bun
  code; workspace libraries bundled by tsdown are development dependencies.
- `@chalk/review-canvas` ([app](app/README.md)): private browser UI, layout
  libraries, and browser tests. It builds separately and is not included in npm.
- `@chalk/review-electrobun`: packages the native desktop, Bun backend, and built canvas.

### Imports

Import through `@review/*` (`src`) and `@canvas/*` (`app/src`) instead of
`../` paths; keep `./` for siblings. `bun run lint` enforces this. Bun reads the aliases from tsconfig.
`bun scripts/rewrite-relative-imports.mjs` (from the repository root) converts
a branch that predates the aliases.

## Usage

Start or activate Chalk Desktop. You can run this command outside a
repository and without a terminal:

```sh
chalk app launch --json
```

Reviews are authored through the JSON API: `chalk api` calls a tool
directly, and `chalk mcp` serves the same catalog over stdio MCP for a
connected agent.

To select a review, run:

```sh
chalk app pick
```

Use `chalk app pick --session <uuid>` to select a specific review. Bare
`chalk app` is an alias for `chalk app launch`.

`chalk info` is read-only: it lists active reviews bound to the current
worktree, or every worktree in the repository with `--all`.

Chalk Desktop is the primary install path for Claude Code, Codex,
OpenCode, Pi, oh-my-pi, and Copilot CLI. Install the `chalk` command from
the welcome screen, then select your agent and either copy the setup prompt
or follow its install command. On macOS and Linux, Desktop writes a
`chalk` shim to `~/.local/bin` that resolves to the app's bundled CLI.
A standalone CLI defers to the app's bundled copy whenever Chalk
Desktop is running.

Agent setup installs only the Chalk CLI and the MCP connection. Enabling
Trace capture in Settings ▸ Experimental Features also installs FFF: it
registers the standard `fff` MCP server for Claude and Codex, and installs
`npm:@ff-labs/pi-fff` for Pi. The MCP registration points FFF at
`$DEV_REVIEW_HOME/trace-search` (default `~/.dev/trace-search`). Chalk
accepts existing FFF integrations without changes. Silent app-update
synchronization never runs an FFF installer.

The experimental setup configures S3/R2 and enables trace capture for the machine.
Traces go to one selected store: a S3/R2 bucket, or the hosted store
selected explicitly with `chalk trace storage use hosted` after `chalk
login` and `chalk trace allow`. The selection, the store settings, and the
hosted consent list live in `$DEV_REVIEW_HOME/trace/config.json`; an existing
`~/.config/dev-trace` setup keeps selecting the bucket without any change.
Each agent session activates its current repository. Git receives a managed
hook dispatcher that chains the repository's prior hooks. Jujutsu receives a
repository commit-trailer template. A target repository needs no Chalk
files.

Trace capture hooks each agent's session lifecycle: Claude Code and Codex
through their hook settings, Pi through a managed extension, and OpenCode
through a managed `~/.config/opencode/plugins/review-trace.ts` plugin. OpenCode
keeps sessions in its own database, so `chalk trace sync` renders one with
`opencode export` before upload.

Use `chalk trace status` to inspect the machine, current repository, and your
recent hosted uploads. Use `chalk trace status --agent-session <id>` for one
session. Repository writers can upload and check their own upload status.
Repository admins can read transcript content. Download links expire after
five minutes. Status reports the store's publication record; it does not
repeat object integrity checks. If the server is unavailable, status reports
"not checked".
Use
`chalk trace enable`, `chalk trace disable`, or `chalk trace repair` only
when you need to manage the current repository manually.

For a missing registration, setup runs the equivalent commands:

```sh
curl -fsSL https://raw.githubusercontent.com/dmtrKovalenko/fff/v0.11.0/install-mcp.sh | bash
claude mcp add -s user fff -- "$HOME/.local/bin/fff-mcp" "$HOME/.dev/trace-search"
codex mcp add fff -- "$HOME/.local/bin/fff-mcp" "$HOME/.dev/trace-search"
pi install npm:@ff-labs/pi-fff
```

Trace search uses this local flow:

```text
S3/R2 or hosted raw trace
  → temporary download (hosted copies are checksum-verified)
  → normalized JSONL in ~/.dev/trace-search, scoped per store
  → FFF, chalk trace show, Chalk UI, and quote validation
```

The app-managed command starts the exact macOS bundle that installed it. The
bundle does not need to be under `/Applications`. A repository or standalone
CLI uses the `Chalk.review` macOS bundle identifier.

If `chalk` opens a browser or reports old options, another command shadows
the current CLI. Run `command -v chalk`, `chalk version`, and
`chalk --help`. Remove the legacy PATH entry, or put the app-managed
`~/.local/bin/chalk` command first on `PATH`.

To connect an agent by hand, run:

```sh
chalk connect <target>
```

Use `claude`, `claude-code`, `codex`, `opencode`, `pi`, `omp`, or `copilot` as
the target, or `all` for every supported agent. The command prints the
plugin-install or MCP-registration steps for your agent. The Desktop welcome
screen also offers setup prompts and install commands.
