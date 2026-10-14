# Contributing to Chalk

Thanks for contributing to Chalk. We welcome bug reports, fixes, and new
features. By participating, you agree to follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

Open an issue before starting anything significant. Describe the problem and
your proposed approach, and wait for a maintainer to confirm it before you
write code. This avoids duplicate work and catches design constraints early.
Small fixes, such as typos and obvious bugs, can go straight to a pull request.

Check [open issues](https://github.com/andrewmalikov/chalk/issues) first.

Report security vulnerabilities privately as described in
[SECURITY.md](SECURITY.md), not in a public issue.

## Setup

Chalk uses Bun 1.4.2 or newer and Hutch 0.27.1. The native desktop
build currently requires macOS on Apple Silicon. With [mise](https://mise.jdx.dev/)
installed, run from the repository root:

```sh
mise run install
open ~/Applications/Chalk.app
```

Set `HUTCH_INSTALL_URL` to the Hutch installer URL if Hutch 0.27.1 is not
already installed. CI uses the repository variable of the same name.
Mise installs the pinned Bun version, Hutch, and workspace dependencies before
building. The installed development app uses this checkout and mise's Bun;
keep both in place and rerun `mise run install` after changing the code or moving
the checkout. Quit the app before reinstalling.

Use `mise run dev` to build and launch directly from the checkout, or
`mise run build` to build without installing. To set up without mise, install
Bun 1.4.2 or newer and Hutch, then run:

```sh
curl -fsSL "${HUTCH_INSTALL_URL:?Set HUTCH_INSTALL_URL to the Hutch installer URL}" | bash -s -- --version 0.27.1
bun install
bun dev
```

The desktop uses `~/.dev-fast/review-electrobun` by default. To use an existing
profile, set `DEV_REVIEW_HOME` when starting it. Run `chalk instances` to
see running apps and `chalk instances use <key>` to select one for the
CLI and your agent. Reconnect the MCP server after switching.

## Repository layout

Chalk is split into application hosts and shared packages.

| Location | Owns |
| --- | --- |
| `apps/review-electrobun/` | Native desktop shell and Bun sidecar lifecycle |
| `apps/review-canvas/` | React canvas, rendering, interaction, and browser state |
| `packages/review/` | Review logic: documents, authoring, persistence, managed checkouts, GitLab, and comparisons |
| `packages/server/` | Authenticated HTTP endpoints and server lifecycle |
| `packages/cli/` | Command parsing, terminal selection, and CLI output |
| `packages/mcp/` | MCP transport and tools that call the server |
| `packages/review-contracts/` | Process contracts, HTTP client, and event streams |
| `packages/tutorial/` | Tutorial assets, their generation, and runtime asset paths |
| `packages/local-vcs/` | Local version-control operations |
| `packages/json/` | JSON decoding and value helpers |
| `packages/agent-plugins/` | Integrations for supported coding agents |

`review` owns review behavior. Its document and block modules run in the browser;
`review/node/*` owns persistence, filesystem access, subprocesses, and local
integrations. These runtime modules are imported only by server, CLI, and desktop
code. The desktop owns command setup routes and its sidecar entry point. Review
logic never imports these wrappers; lint enforces that direction and keeps runtime
modules out of browser code.

Workspace build steps and shared test configuration live in the root
`package.json` and `scripts/`.

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
cd apps/review-canvas
bun --bun run playwright install chromium
cd ../..
bun run --filter @chalk/review-canvas test:browser
bun run --filter @chalk/review-canvas test:browser:watch
```

Executable behavior scenarios live in `features/`, grouped by product capability.
Run them in headless Chromium with:

```sh
bun run test:acceptance
```

Write complete Gherkin scenarios with product language and visible outcomes.
TypeScript bindings live in `tests/acceptance/steps/`; shared browser setup lives
in `tests/acceptance/support/`. Playwright-BDD generates the runnable tests before
each run and rejects missing or ambiguous step definitions. Generated tests and
reports are ignored by Git. The suite mounts the real canvas with fixture-backed
API data; native desktop and real backend behavior have separate tests.

The root `test` and `typecheck` commands include acceptance coverage. Run
`bun run typecheck:acceptance` to check just the acceptance TypeScript. Failure
screenshots and traces are saved in `tests/acceptance/test-results/`; the HTML
report is in `tests/acceptance/playwright-report/`.

Document rule tests run through `bun run --filter @chalk/review test`.
Filesystem and server tests run through `bun run --filter @chalk/server test`.
Run `bun run --filter @chalk/server test:integration:diffr` to check the
bundled diffr binary and repository comparisons.

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
  migrations, data-sharing changes, or desktop runtime changes.

If your change affects what data leaves the machine, update
[docs/privacy.md](docs/privacy.md) in the same pull request.
