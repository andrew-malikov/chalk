# Gherkin Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let reviewers read and run review navigation and restoration behavior
as complete Gherkin feature files.

**Architecture:** Playwright-BDD generates Playwright tests from the root feature
catalog. A Vite harness mounts the real canvas with the existing fixture bridge.
Scenario fixtures own browser state and cleanup; existing store-backed tests stay.

**Tech Stack:** Bun 1.4.2, Playwright Test 1.62.1, Playwright-BDD 9.2.1,
existing Vite 8.0.16 and React 19.2.5.

**Spec:** [Approved design](../specs/2026-10-14-gherkin-acceptance-design.md).

## Global Constraints

- Existing product behavior stays the same.
- Generated files stay out of Git.
- Pin Playwright Test to the existing Playwright version.
- Keep harness modules out of desktop entry points and build outputs.
- Keep execution details in TypeScript.
- Each scenario gets a fresh browser context.
- Native window startup, IPC, and the packaged app remain outside this slice.
- Preserve the existing navigation integration checks and persistence tests.
- Do not edit README.md. Add no change detector tests.
- Use `mise exec -- bun` locally: the shell's Bun is 1.2.15, and the installed
  project runtime is 1.4.2 (`mise which bun`).

## Review Focus

- A selected navigation button must correspond to visible content; assert both.
- Reopening must dispose the prior canvas and watch stream while retaining storage.
- Unhandled fixture requests must fail the scenario, even if navigation renders.
- Missing bindings or ambiguous steps must fail generation before browser startup.
- A scenario that leaves persisted state must not affect the next scenario.

---

### Task 1: Run navigation scenarios in Chromium

**Files:**
- Create: `features/reviewing/navigation.feature`
- Create: `tests/acceptance/playwright.config.ts`
- Create: `tests/acceptance/vite.config.ts`
- Create: `tests/acceptance/tsconfig.json`
- Create: `tests/acceptance/harness/index.html`
- Create: `tests/acceptance/harness/review.ts`
- Create: `tests/acceptance/support/fixtures.ts`
- Create: `tests/acceptance/steps/navigation.steps.ts`
- Modify: `apps/review-canvas/src/test/fixture-review-bridge.ts`
- Modify: `package.json`, `bun.lock`, `.gitignore`

**Interfaces:**
- Existing `fixtureReviewBridge(api: FixtureReviewApi): ReviewCanvasBridge` gets
  optional `commits?: readonly ReviewCommitSummary[]`; its commits response uses
  that value, defaulting to the current empty array. Other callers keep defaults.
- Export `ReviewHarness` from `harness/review.ts`, with
  `open(version: number, includeCommit: boolean): void`, `close(): void`,
  `errors: string[]`, and `activeStreams: number`.
  Expose it as `window.reviewHarness` for Playwright.
- Export the extended Playwright-BDD `test` and bound `Given`, `When`, `Then`
  from `support/fixtures.ts`.
- The scenario-scoped `review` fixture exposes `open(version?: number): Promise<void>`,
  `close(): Promise<void>`, and `addVersion(version: number, includeCommit?: boolean): void`.
  Start with version 3 and its sample commit. Reopening defaults to the current
  version. Reject opening a version that the scenario has not provided.

- [ ] **Step 1: Add the runner dependencies and failing feature.**

Add root dev dependencies `@playwright/test@1.62.1` and `playwright-bdd@9.2.1`
using the pinned Bun. Copy the approved `navigation.feature` verbatim from the
spec. Configure `defineBddConfig` with features `../../features/**/*.feature`,
steps `./steps/**/*.ts`, and output `./.features-gen`, relative to the config.

Add `test:acceptance` to generate with
`bun --bun run bddgen --config tests/acceptance/playwright.config.ts`, then run
`bun --bun run playwright test --config tests/acceptance/playwright.config.ts`.
The generation command must succeed before execution can start.

- [ ] **Step 2: Verify the unbound scenarios fail.**

Run `mise exec -- bun run test:acceptance` before defining steps.
Expected: nonzero exit naming the missing navigation bindings.

- [ ] **Step 3: Implement the browser harness and fixtures.**

Use the existing canvas config builder for Vite plugins, overriding the root to
`tests/acceptance/harness`. Merge `workspaceTestAliases` from
`scripts/test-config.ts` over the builder's aliases so workspace imports use
current source without requiring compiled `dist` output. Serve on
`127.0.0.1:4175` with a strict port. Let Playwright manage Vite startup and shutdown;
set `webServer.cwd` to the repository root explicitly and do not reuse an unrelated
server. The harness loads `/virtual:stylex.css` after its canvas imports are
transformed. It mounts through `mountReviewCanvas` with a pinned content version.

Use one review identity, a markdown document marker, and pinned base/head refs.
Provide the sample commit `Add the API`, with distinct 40-character base/head
SHAs, and an `API changes` lens through `FixtureReviewApi.progress`. Enable the
existing Diff and Commits views through the fixture pins. Reuse fixture bridge
responses for diff data. Make commits optional in that shared helper as above.

Pinned mounts still subscribe to live activity. In the acceptance request wrapper,
handle `/reviews-api/watch?subscriptions=...` before delegating other requests.
Validate that subscriptions target the fixture review. Follow the existing shell
browser fixture: send one newline-terminated JSON array with a `{ value }` entry
for each subscription, containing its snapshot and `activity: "unknown"`.
Use `application/x-ndjson` and keep the stream open until abort or reader cancellation.
Both paths release the stream once and remove their abort listener.

`open` disposes the prior mount before creating the next one; `close` disposes
and clears its handle without clearing browser storage. Wrap the fixture request
handler so any unhandled response is recorded in `errors` and fails the request.
Track `activeStreams`. The Playwright fixture closes and awaits zero active
streams before reopening, using a polling assertion. Scenario teardown disposes
the mount, awaits zero streams, and asserts the error list is empty. Capture
uncaught page errors as failures. Fresh contexts isolate all scenario storage.

Playwright uses Chromium headless with a 1280x900 viewport, one worker, zero
retries, a 30-second test timeout, and a 120-second Vite startup timeout. Retain
failure screenshots and traces in `tests/acceptance/test-results`. Write the HTML
report to `tests/acceptance/playwright-report` without opening it automatically.
Ignore these directories and `.features-gen` in Git.

The acceptance tsconfig extends the canvas tsconfig, includes authored acceptance
TypeScript, and excludes generated output. Preserve the existing source aliases.

- [ ] **Step 4: Bind navigation steps to the rendered canvas.**

Use accessible button names for Chalk, Diff, and Commits. Assert the selected
button's `aria-pressed` and a visible view-specific marker: the markdown document,
the diff UI, or the commit list. Scope `Open commit diff` to the article containing
`Add the API`. Verify the scoped diff displays that subject; the whole diff must
have no commit scope. Use Playwright assertions to await rendering.

- [ ] **Step 5: Verify navigation and failure propagation.**

Run `mise exec -- bun run test:acceptance`.
Expected: five passing examples from `navigation.feature`.
Run acceptance typechecking with `mise exec -- bun --bun run tsc --noEmit -p tests/acceptance`.

Temporarily change one expected view so a scenario fails its UI assertion, then
restore it. Temporarily issue an unhandled fixture request from the harness;
expect teardown to fail, then restore it. Regenerate and rerun navigation cleanly.
These are fault checks, not committed tests of runner internals.

- [ ] **Step 6: Commit the working navigation suite.**

Commit the listed authored files and lockfile as `test: run Gherkin navigation scenarios`.
Inspect the staged diff to ensure no generated tests or reports are included.

### Task 2: Exercise review restoration through Gherkin

**Files:**
- Create: `features/reviewing/resuming.feature`
- Create: `tests/acceptance/steps/resuming.steps.ts`
- Modify: `tests/acceptance/support/fixtures.ts` only if shared operations need it

**Interfaces:**
- Consume Task 1's bound step functions and `review` fixture.
- Add version 4 with its commit present or absent using `review.addVersion`.
- Reuse navigation step bindings by expression matching; register each expression
  once. Keep setup and assertions on the rendered canvas.

- [ ] **Step 1: Copy the approved restoration scenarios and verify missing bindings.**

Copy `resuming.feature` verbatim from the spec.
Run `mise exec -- bun run test:acceptance`.
Expected: generation fails for the new unimplemented restoration steps.

- [ ] **Step 2: Implement restoration step definitions.**

Setup steps open version 3, select the requested view or lens through UI actions,
or open the sample commit diff. A provided version 4 keeps the same review
identity; its commit list follows the scenario. Reopening calls close then open
without replacing the browser context. Assert rendered selection and content.

For lens restoration, assert the `API changes` toggle is pressed on version 3.
For version 4, first await the lens list and then assert no lens toggle is
pressed. An absent element alone cannot prove that the selection was cleared.
Assert the Diff view remains displayed in both cases. For commit restoration,
assert the scoped subject when present and the whole diff when absent.

- [ ] **Step 3: Verify all scenarios and storage isolation.**

Run `mise exec -- bun run test:acceptance`.
Expected: twelve passing examples across the two features.
Run `mise exec -- bun run test:acceptance --repeat-each=2` once, ensuring the root
script forwards the option to Playwright execution. Expected: twenty-four passes.

Temporarily introduce a duplicate binding and verify generation rejects it.
Remove the duplicate and regenerate. Confirm the repeated run starts each review
with fresh context state while reopen steps retain state inside their scenario.

- [ ] **Step 4: Commit the restoration scenarios.**

Commit as `test: describe review restoration in Gherkin`.

### Task 3: Include acceptance coverage in repository checks

**Files:**
- Modify: `package.json`, `.oxlintrc.json`, `.oxfmtrc.json`
- Modify: `.github/workflows/review-desktop-ci.yml`
- Modify: `CONTRIBUTING.md`

**Interfaces:**
- Consume `test:acceptance` from Task 1.
- Add `typecheck:acceptance` using `tsc --noEmit -p tests/acceptance`.
- Root `test` and `typecheck` retain existing workspace checks and append their
  acceptance commands. Root formatting includes authored `tests/acceptance` files.

- [ ] **Step 1: Wire the existing checks and contributor instructions.**

Exclude generated tests and acceptance reports from lint and formatting discovery.
Set Playwright `forbidOnly` when CI is true. Keep strict missing-step generation
and avoid skipped or pending acceptance scenarios. Add failure artifact paths for
the acceptance report and results to the existing upload step. Document the new
command and the separation between Gherkin behavior and TypeScript steps in
`CONTRIBUTING.md`; leave README.md untouched.

- [ ] **Step 2: Verify repository integration.**

Run `mise exec -- bun run typecheck:acceptance`, `mise exec -- bun run lint`,
`mise exec -- bun run format:check`, and `mise exec -- bun run test:acceptance`.
Run the existing canvas integration tests with
`mise exec -- bun run --filter @chalk/review-canvas test:node src/review/canvas-navigation.test.tsx`.
Run existing browser tests for callers of the fixture bridge, including
`src/host/electrobun-shell.browser.test.tsx`, `src/documents/blocks.browser.test.tsx`,
`src/documents/document-root-attributes.browser.test.tsx`, and
`src/documents/markdown-tasks.browser.test.tsx`, through canvas `test:browser`.
All commands must succeed; report any environmental blocker separately.

- [ ] **Step 3: Review and commit the complete integration.**

Review the diff for product changes, accidental test deletion, and generated
artifacts. Commit as `test: include Gherkin acceptance coverage in CI`.

## Rollback and limits

All runtime changes are test infrastructure. Reverting these commits removes the
new runner and commands while retaining existing product code and tests. This
slice does not establish native desktop or real backend end-to-end coverage.

## Research checked on 2026-10-14

- [Playwright-BDD options](https://vitalets.github.io/playwright-bdd/#/configuration/options):
  config-relative paths, generated output, and default failure on missing bindings.
- [Playwright-style fixtures](https://vitalets.github.io/playwright-bdd/#/writing-steps/playwright-style):
  extend `test` from Playwright-BDD and bind step functions with `createBdd(test)`.
- [Playwright web server](https://playwright.dev/docs/test-webserver):
  runner-managed server readiness and teardown.
- `apps/review-canvas/vitest.config.ts:25`: StyleX dev CSS handling.
- `scripts/test-config.ts:25`: source aliases for test workspace imports.
- `apps/review-canvas/src/test/fixture-review-bridge.ts:59`: current empty commits fixture.
- `apps/review-canvas/src/host/electrobun-shell.browser.test.tsx:281`: cancellable watch fixture.
- `apps/review-canvas/src/review/api-canvas.tsx:147`: pinned mounts still subscribe.
- `apps/review-canvas/src/review/review-view-state.ts:175`: version-scoped restoration.
- `package.json:29`: existing root workspace test execution.

## Plan review

An independent review found a missing watch fixture and a dependency on compiled
workspace output. Both are addressed in Task 1. Review also checked fixture
compatibility and whether the assertions exercise visible behavior. No other
blockers or major findings were reported. Runtime verification belongs to execution.
