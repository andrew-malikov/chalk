# Contributing to Whiteboard

Thanks for contributing to Whiteboard. We welcome bug reports, fixes, and new
features. By participating, you agree to follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

Open an issue before starting anything significant. Describe the problem and
your proposed approach, and wait for a maintainer to confirm it before you
write code. This avoids duplicate work and catches design constraints early.
Small fixes, such as typos and obvious bugs, can go straight to a pull request.

Check [open issues](https://github.com/devdotfast/review/issues) first.
Questions are welcome on [Discord](https://discord.gg/wYvd2cpMQg).

Report security vulnerabilities privately as described in
[SECURITY.md](SECURITY.md), not in a public issue.

## Setup

Whiteboard uses Bun 1.4.2 or newer and Hutch 0.27.1. The native desktop
build currently requires macOS on Apple Silicon. Install Hutch, then run
from the repository root:

```sh
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | bash -s -- --version 0.27.1
bun install
bun dev
```

The desktop uses `~/.dev-fast/review-electrobun` by default. To use an existing
profile, set `DEV_REVIEW_HOME` when starting it. Run `whiteboard instances` to
see running apps and `whiteboard instances use <key>` to select one for the
CLI and your agent. Reconnect the MCP server after switching.

## Repository layout

The product is named Whiteboard, but package names and directories still use
`review`.

- `apps/review-electrobun/` contains the native Electrobun/Cottontail desktop
  host. It launches the shared backend as a Bun sidecar.
- `packages/review/` contains the `whiteboard` command-line interface, embedded
  server, and canvas.
- `packages/review-protocol/` contains the shared process contracts.
- `packages/trace-core/` and `packages/trace-protocol/` contain agent trace
  capture and the hosted trace store contract.
- `packages/agent-plugins/` contains the plugins and skills for supported
  coding agents.
- `packages/local-vcs/` contains local version-control helpers.

The former Code OSS fork is available from this repository's Git history.
Its upstream was [microsoft/vscode](https://github.com/microsoft/vscode/tree/8a7abeba6e03ea3af87bfbce9a1b7e48fed567b8)
(commit `8a7abeba6e03ea3af87bfbce9a1b7e48fed567b8`, also tagged locally as
`code-oss-upstream-8a7abeba`).

## Testing

Run the full check suite before you open a pull request:

```sh
bun run ci
```

DOM-facing tests run in Chromium through Vitest Browser Mode. Install the
browser once, then run the headless suite or watch mode:

```sh
cd packages/review/app
bun --bun run playwright install chromium
cd ../../..
bun run --filter @dev.fast/review-canvas test:browser
bun run --filter @dev.fast/review-canvas test:browser:watch
```

Filesystem and server tests run through
`bun run --filter @dev.fast/review test:node`.

`bun run --filter @dev.fast/review test:legacy-corpus` replays a private corpus of
legacy Reviews (from before the Whiteboard rename) through migration. Point
`REVIEW_LEGACY_CORPUS` at a directory whose children are Review UUID folders;
the script fails if the variable is unset. The corpus is copied before it is
touched and the originals are re-verified afterwards.

Test behavior, not implementation. Do not add
[change detector tests](https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html).
If you find one, delete it instead of updating it, and say so in your pull
request.

## Pull requests

Work on a branch, and keep each pull request focused on one change. Avoid
mixing refactors, docs, and features unless they are tightly related.

Write the pull request title as a short, plain-language summary of the change,
such as "Keep code evidence loading until its comparison resolves". In the
description:

- link the issue it addresses;
- describe the behavior you added or changed;
- explain how you validated it; and
- call out anything reviewers should pay attention to, such as stored-data
  migrations, telemetry changes, or desktop runtime changes.

If your change adds or changes telemetry, update
[docs/telemetry.md](docs/telemetry.md) in the same pull request.
