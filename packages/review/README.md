# dev.fast Blackboard

The `@dev.fast/review` package provides the `blackboard` CLI for headless review
authoring and agent trace capture. It requires Bun 1.4.2 or newer. An npm install
also provides `review` and `whiteboard` as aliases for `blackboard`.
`blackboard server` and `blackboard trace` run without installing or starting Desktop.
Blackboard Desktop displays the review canvas; its server owns review
discovery, session state, and presentation. Legacy reviews
published with the removed MDX toolchain have a durable UUID directory under
`${DEV_REVIEW_HOME:-~/.dev}/reviews/<uuid>/` and are imported into the JSON
store when Home lists them or when they are opened.

## Workspace packages

- `@dev.fast/review`: Bun runtime, CLI, and authoring tools. Its
  production dependencies are the external libraries used by the compiled Bun
  code; workspace libraries bundled by tsdown are development dependencies.
- `@dev.fast/review-canvas` ([app](app/README.md)): private browser UI, layout
  libraries, and browser tests. It builds separately and is not included in npm.
- `@dev.fast/review-electrobun`: packages the native desktop, Bun backend, and built canvas.

### Imports

Import through `@review/*` (`src`) and `@canvas/*` (`app/src`) instead of
`../` paths; keep `./` for siblings. `bun run lint` enforces this. Bun reads the aliases from tsconfig.
`bun scripts/rewrite-relative-imports.mjs` (from the repository root) converts
a branch that predates the aliases.

## Migration

To migrate stored reviews with a compatible `blackboard` command, run:

```sh
blackboard migrate apply
```

The command normalizes stored review schema versions, regenerates presented
artifacts, converts Jujutsu repositories and Blackboard-managed checkouts, and
removes legacy global CLI installs and catalog entries. It reports blockers
for items that need manual correction; fix each one and run the command
again. Use `--force` to restart interrupted state.

## Usage

Start or activate Blackboard Desktop. You can run this command outside a
repository and without a terminal:

```sh
blackboard app launch --json
```

Reviews are authored through the JSON API: `blackboard api` calls a tool
directly, and `blackboard mcp` serves the same catalog over stdio MCP for a
connected agent.

To select a review, run:

```sh
blackboard app pick
```

Use `blackboard app pick --session <uuid>` to select a specific review. Bare
`blackboard app` is an alias for `blackboard app launch`.

`blackboard info` is read-only: it lists active reviews bound to the current
worktree, or every worktree in the repository with `--all`.

Blackboard Desktop is the primary install path for Claude Code, Codex, Cursor,
Pi, and other coding agents. On startup it detects installed agents, offers to
install the CLI and connect them over MCP, and re-syncs after each app
update. It also writes a `blackboard` shim to `~/.local/bin` that always resolves
to the app's bundled CLI. A standalone CLI defers to the app's bundled copy
whenever Blackboard Desktop is running.

Agent setup installs only the Blackboard CLI and the MCP connection. Enabling
Trace capture in Settings ▸ Experimental Features also installs FFF: it
registers the standard `fff` MCP server for Claude and Codex, and installs
`npm:@ff-labs/pi-fff` for Pi. The MCP registration points FFF at
`$DEV_REVIEW_HOME/trace-search` (default `~/.dev/trace-search`). Blackboard
accepts existing FFF integrations without changes. Silent app-update
synchronization never runs an FFF installer.

The experimental setup configures S3/R2 and enables trace capture for the machine.
Traces go to one selected store: a S3/R2 bucket, or the hosted store
selected explicitly with `blackboard trace storage use hosted` after `blackboard
login` and `blackboard trace allow`. The selection, the store settings, and the
hosted consent list live in `$DEV_REVIEW_HOME/trace/config.json`; an existing
`~/.config/dev-trace` setup keeps selecting the bucket without any change.
Each agent session activates its current repository. Git receives a managed
hook dispatcher that chains the repository's prior hooks. Jujutsu receives a
repository commit-trailer template. A target repository needs no Blackboard
files.

Trace capture hooks each agent's session lifecycle: Claude Code and Codex
through their hook settings, Pi through a managed extension, and OpenCode
through a managed `~/.config/opencode/plugins/review-trace.ts` plugin. OpenCode
keeps sessions in its own database, so `blackboard trace sync` renders one with
`opencode export` before upload.

Use `blackboard trace status` to inspect the machine, current repository, and your
recent hosted uploads. Use `blackboard trace status --agent-session <id>` for one
session. Repository writers can upload and check their own upload status.
Repository admins can read transcript content. Download links expire after
five minutes. Status reports the store's publication record; it does not
repeat object integrity checks. If the server is unavailable, status reports
"not checked".
Use
`blackboard trace enable`, `blackboard trace disable`, or `blackboard trace repair` only
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
  → FFF, blackboard trace show, Blackboard UI, and quote validation
```

The app-managed command starts the exact macOS bundle that installed it. The
bundle does not need to be under `/Applications`. A repository or standalone
CLI uses the `dev.fast.review` macOS bundle identifier.

If `blackboard` opens a browser or reports old options, another command shadows
the current CLI. Run `command -v blackboard`, `blackboard version`, and
`blackboard --help`. Remove the legacy PATH entry, or put the app-managed
`~/.local/bin/blackboard` command first on `PATH`.

To connect an agent by hand, run:

```sh
blackboard connect <target>
```

for `claude`, `claude-code`, `codex`, `cursor`, `opencode`, `pi`, `omp`, or
`all`. It prints the plugin-install or MCP-registration steps for that agent;
Blackboard Desktop runs the same steps automatically during agent setup.
