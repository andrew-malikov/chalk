# Remove Agent Traces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove agent transcript capture and browsing from Blackboard while preserving canvas authoring, source navigation, diffs, Ask history, and sharing.

**Architecture:** Move retained utilities and account login into existing review modules, then retire installer-owned hooks before deleting feature consumers and both trace packages. Document, backend and UI removal form one atomic integration task because their discriminated unions and routes are coupled. Old trace-containing reviews are unsupported: reject their retired blocks/resources rather than migrate or silently omit quotes. Keep the existing document/share trust boundaries and supported legacy imports.

**Tech Stack:** TypeScript, Bun 1.4.2, Zod 4.6.5, React 19.2.5, Vitest 4.1.11, Hono, SQLite, Electrobun.

**Spec:** [Approved design, amended for the user's decision to drop old trace reviews](../specs/2026-10-11-remove-agent-traces-design.md).

## Global Constraints

- Read the design and repository AGENTS.md before executing. README.md requires explicit permission; leave it and the GitLab-focused root SPEC.md unchanged.
- Use Bun >=1.4.2; the current shell has 1.2.15. Select/install the required runtime before dependency resolution or verification.
- Preserve Ask conversations/history, startup diagnostic spans, diagram animations, source validation, and sharing/login.
- Preserve external transcripts, remote objects, saved profile data/history, and existing Agent-Session commit trailers. No purge operation or database rewrite.
- Keep `DEV_REVIEW_HOME` resolution and `<profile>/auth.json` unchanged. No replacement catch-all package, feature flag, or renamed transcript subsystem.
- Run installer cleanup tests only against temporary homes/profiles/repositories; never run it on the developer's real configuration.
- Test observable behavior and data preservation. Delete obsolete trace-only tests; follow AGENTS.md for any change-detector tests encountered.
- Tasks are sequential; retain trace packages until Task 4 so retained consumers remain resolvable. Task 3 has three phases and one verification/commit boundary; do not commit or claim an intermediate compilable state between its phases. Commit only explicit task paths, excluding unrelated changes and the existing untracked `.archify/` tree.

## Review Focus

- Dead foreign commands, custom launchers, Windows companions, and handwritten agent hooks must survive ownership checks (Task 2).
- Same-fingerprint upgrades, declined consent, and interrupted cleanup must still retire owned hooks or retry visibly (Task 2).
- Sealed JSX runtime stubs must reject retired TraceQuote instead of silently losing children (Task 3).
- Old shared manifests must reject trace resources before object downloads; supported bundles still enforce digests/pins (Task 3).
- Profiles upgraded from trace-enabled builds must retain sharing credentials and Ask history (Tasks 1 and 3).

---

## Decisions and rollback

Use existing review modules for generic utilities and account login. Move implementations and behavior tests with their semantics intact; changing atomic writes or locking is outside scope. The hosted OAuth client keeps its existing wire client ID `review-cli` and origin, requesting only `scope: "identity"`.

Use one strict `review-share/1` manifest schema with resource kinds `image | map`. The user's latest decision eliminates quote conversion and incoming legacy trace manifests. Generic migrations and non-trace legacy imports remain; unsupported trace content yields an error before transcript access.

Hook retirement is the only retained trace-specific operational code. Establish ownership through this installation's recorded command paths and managed wrapper metadata, never executable basename or liveness. Preserve unknown ownership and report failures. A separately versioned completion marker allows retry independently of the install fingerprint and consent.

The change is for Blackboard users who want the canvas and sharing without transcript capture. No new dependencies, quote migration, trace purge, remote storage changes, or Git history edits are included. Reverting product commits restores code; it does not reinstall removed hooks automatically. Record cleanup results, preserve predecessor configuration and unknown files, and let an older installer explicitly reinstall its own hooks if rollback requires them.

## Task 1: Extract retained utilities and identity login

**Files:**
- Create: `packages/review/src/lib/{atomic-write,with-file-lock,error-message,shell-quote}.ts`.
- Create: `packages/review/src/cli/cli-output.ts`; `packages/review/src/sharing/{store-auth,store-client,store-origin}.ts`.
- Modify: `packages/review/src/{package-paths.ts,storage/review-home-paths.ts,sharing/auth.ts,sharing/host.ts,server/account-alias.ts,cli/cli-runner.ts}` and their connected retained utility imports.
- Move tests: `packages/trace-core/src/{atomic-write,with-file-lock}.test.ts` to `packages/review/src/lib/`; retained account cases from `{store-auth,store-client}.test.ts` to `packages/review/src/sharing/`.
- Test: `packages/review/src/sharing/{auth,host,publish}.test.ts`, `packages/review/src/review-api/profile.test.ts`, `packages/review/src/package-paths.test.ts`.

**Interfaces:**
- Consumes: current trace-core implementations and signatures; inventory exports/imports with `rg '@dev.fast/trace-(core|protocol)' packages apps scripts`.
- Produces: existing atomic-write, lock/process-identity, error, CLI-output and package-root signatures from their new locations. `devReviewHome(env?: NodeJS.ProcessEnv, homeDir?: string): string` and `DEV_REVIEW_HOME_ENV` live in `storage/review-home-paths.ts`.
- Produces: sharing-local `StoreClient.deviceCode()` (no trace flag), `deviceToken(deviceCode: string)`, and `session()` with existing response shapes. `runStoreLogin` retains current injected streams/browser/sleep/fetch/env options and `Promise<number>`, removing only `traces`.
- Produces: `StoreAuth`, credential read/write/clear, `requireStoreClient`, and explicit `DEFAULT_STORE_ORIGIN`, preserving their signatures, default origin and credential file. Device responses remain local types; retain only necessary account error contracts.

- [ ] **Step 1: Establish the verification baseline.** Select Bun 1.4.2 or newer and record `bun --version`. Run the review tests, canvas node/browser tests, typecheck, lint and format checks once before edits. Record failing test names and commands in an implementation log outside product code. Use the current baseline to distinguish existing failures; do not assume the previously noted browser shell failures remain unchanged.
- [ ] **Step 2: Write the account regression tests.** In relocated `store-auth.test.ts` and `store-client.test.ts`, assert the device request sends `client_id: "review-cli"` and `scope: "identity"`; a pre-existing `<DEV_REVIEW_HOME>/auth.json` authenticates sharing; logout removes only that file. Test `authorization_pending`, `slow_down` increasing subsequent waits by 5,000 ms, expiry stopping polling, and failed login leaving existing credentials intact. Reuse injected fetch/sleep fixtures.
- [ ] **Step 3: Run the red tests.** From `packages/review`: `bun --bun run vitest run --config vitest.config.ts src/sharing/store-auth.test.ts src/sharing/store-client.test.ts`. Expect missing destination modules or the current trace scope to fail; unrelated fixture/runtime failures are not the expected red.
- [ ] **Step 4: Move generic implementations.** Preserve atomic-write permissions/symlinks, locking, process identity and profile semantics. Copy `findPackageRoot` into `package-paths.ts`; place only the retained `shellQuote` helper in `lib/shell-quote.ts`. Move existing meaningful tests, then repoint retained consumers without changing behavior.
- [ ] **Step 5: Trim and move account login.** Keep bounded requests/timeouts, origin normalization, device polling and error decoding. Remove trace CRUD/uploads/listing, repository authorization retries and trace-only contracts from the new sharing client. Remove `login --traces` and trace authorization remedies from the CLI; retained sharing auth and account telemetry use the new client. Keep original trace-core code temporarily for remaining trace consumers.
- [ ] **Step 6: Verify extraction and login.** From `packages/review`: `bun --bun run vitest run --config vitest.config.ts src/lib/atomic-write.test.ts src/lib/with-file-lock.test.ts src/sharing/store-auth.test.ts src/sharing/store-client.test.ts src/sharing/auth.test.ts src/sharing/host.test.ts src/sharing/publish.test.ts src/review-api/profile.test.ts src/package-paths.test.ts`. Expect retained behaviors to pass; run the package typecheck to catch moved import/type failures.
- [ ] **Step 7: Commit the extraction.** Stage explicit changed utility/account files and moved tests; `git commit -m "refactor: move review utilities and sharing identity out of traces"`.

## Task 2: Retire only this installation's managed hooks

**Files:**
- Create: `packages/review/src/cli/retired-trace-hooks.ts`, `retired-agent-hooks.ts`, `retired-repository-hooks.ts`, and corresponding behavior tests.
- Modify: `packages/review/src/cli/cli-install.ts`; `packages/review-protocol/src/contracts.ts` when removing normal stamp/status trace fields in Task 3, Phase B.
- Adapt only removal/ownership behavior from `packages/trace-core/src/{agent-trace-hooks,trace-repository-hooks,trace-command}.ts` and their tests.
- Test: `packages/review/src/cli/cli-install.test.ts` using its temporaryHome/isolatedEnvironment fixtures.

**Interfaces:**
- Consumes: Task 1 atomic writes, locks, profile paths and shell quoting; raw old install stamp with optional `traceManaged`/`shimPath`; registered repositories and their `.git` common-directory `dev-fast/trace-hooks/state.json`.
- Produces: `retireManagedTraceHooks(input: {env: NodeJS.ProcessEnv; homeDir: string; ownedCommands: readonly string[]}): Promise<{complete: boolean; warnings: string[]}>`. Caller runs it under the existing desktop install lock; the helper performs no capture, installation, transcript discovery or upload.
- Produces: independent `<reviewDesktopStateDir>/retired-trace-hooks-v1.json` containing `{version: 1, ownedCommands: string[], scope: {homeDir: string, xdgConfigHome: string}}` only after full successful cleanup. Resolve scope paths with the same rules as agent-config discovery. Skip only when version, normalized command set and scope match; partial failure writes no completion marker.
- Ownership: build the command set from stamped installer paths and verified installer-owned shim metadata, including Windows `.cmd`/POSIX companions and recorded custom/legacy launchers. Require entry-level management evidence and exact installer-emitted lifecycle structure/command as well as launcher ownership. Verified generated extension markers/wrapper metadata are evidence; launcher path or traceManaged alone is insufficient for an unmarked agent entry. Preserve ambiguous entries with a warning, including unmarked entries indistinguishable from a manually copied generated entry.

- [ ] **Step 1: Write ownership tests.** Using temporary Claude JSON, Codex TOML, OpenCode JS and Pi TS configs, assert verifiably owned entries/extensions are removed and foreign live/dead commands, relative commands without ownership evidence, shell compounds, noncanonical Codex groups and unrelated entries remain byte-for-byte where untouched. A handwritten same-command entry and ambiguous unmarked canonical entry remain with a diagnostic. Re-run with the same profile/commands but a different XDG_CONFIG_HOME and assert the new scope is inspected. Cover XDG paths and Windows installer/companion commands through injected platform fixtures.
- [ ] **Step 2: Write repository/upgrade tests.** Cover linked worktrees deduplicated by common Git directory; local/relative/global predecessor `core.hooksPath`; later user overrides; replaced wrappers and unknown files. Execute predecessor hooks in a temporary repository and assert arguments/stdin and exit status remain effective after cleanup. Assert cleanup runs with unchanged fingerprint and declined consent, repeated cleanup is harmless, and registry/config/write failures remain visible and retry on the next invocation. Exercise both apply and uninstall failure/retry; assert ownership-bearing stamp/launcher remains until successful cleanup.
- [ ] **Step 3: Run red tests.** From `packages/review`: `bun --bun run vitest run --config vitest.config.ts src/cli/retired-agent-hooks.test.ts src/cli/retired-repository-hooks.test.ts src/cli/retired-trace-hooks.test.ts src/cli/cli-install.test.ts`. Expect missing cleanup modules or the old early-return/swallowed-error behavior to fail.
- [ ] **Step 4: Implement removal-only helpers.** Retain the existing format-aware removal parsers and predecessor restoration logic, strengthening exact ownership checks. Restore recorded prior hooksPath only if Git still points at this installation's wrapper. Remove only verified generated files; preserve unknown/replaced files and prune a directory only when empty. Registry corruption/inaccessible registered repositories must not turn into successful empty cleanup; return diagnostics and `complete: false`. Known foreign/unknown ownership is preserved with a warning, not deleted.
- [ ] **Step 5: Integrate retirement before install early returns.** Read raw retired stamp evidence before normal schema stripping; derive owned commands before rewriting/removing launchers. Run cleanup before consent/fingerprint exits in apply/resync and before uninstall destroys ownership evidence. On `complete: false`, return a failure before rewriting stamps, deleting/replacing launchers or clearing install errors, so retries retain ownership evidence. Remove configureTraceMachine/installHarnessHooks/disableTraceMachine branches and repository refresh; obsolete setup requests reject without altering capture configuration until their contracts/UI disappear in Task 3. Surface warnings through existing installer results/status; write the independent marker atomically only on completion. Fresh installation performs no trace setup. Keep marker handling private to the installer, outside product trace status/contracts.
- [ ] **Step 6: Run green tests.** Repeat Step 3 and the package typecheck. Assert injected failure leaves a retry possible and no test used the actual home/profile. Existing installer consent, command disable and Windows PATH behavior must still pass.
- [ ] **Step 7: Commit cleanup.** Stage explicit installer/helper/test files; `git commit -m "fix: retire installer-owned trace hooks safely"`.

## Task 3: Remove trace documents, backend surfaces and UI atomically

Complete Phases A–C before the integration green/typecheck and single commit. Keep `traces.ts` and `trace-schema.ts` until Phase B removes their HTTP/sharing callers.

### Phase A: Documents and import

**Files:**
- Modify: `packages/review/src/review-api/{document,document-text,local-data,store,input-error}.ts`, `packages/review/src/review-api/blocks/{index,markdown}.ts`.
- Create: `packages/review/src/review-api/store-read.test.ts` for current/historical snapshot rejection.
- Delete: `packages/review/src/review-api/blocks/trace_quote.ts`, trace-only fixture/tests. Delete `trace-schema.ts` and `traces.ts` in Phase B.
- Modify: `packages/review/src/documents/{authoring,review-document-data}.ts`; `packages/review/src/publishing/{review-publication-audit,review-publish-element-audit,review-publish-evaluate}.ts`.
- Modify: `packages/review/src/review-import/{legacy-blocks,legacy-resources,import-review,json-cutover}.ts`; preserve supported migrations in `packages/review/src/storage/{stored-document-migration,stored-review-migration}.ts` and sealed-loading support in `packages/review/src/publishing/review-sealed-document.ts`.
- Test: `packages/review/src/review-api/{local-data,store-import,store-read,profile}.test.ts`; `packages/review/src/review-import/{legacy-blocks,import-review,legacy-review-fixtures,legacy-review-corpus,json-cutover}.test.ts`; `packages/review/src/publishing/review-publish-evaluate.test.ts`.

**Interfaces:**
- Consumes: existing strict block/document/resource schemas and supported legacy-import pipeline.
- Produces: normal block union/resource upload excludes `trace_quote`/trace; authoring exports/data schemas exclude `TraceQuote`; `LegacyConversion` no longer has `traces`; import has no `TraceResolver`.
- Produces: `UnsupportedReviewContentError extends ReviewInputError` in `input-error.ts`, with readonly `kind = "agent-traces"` and the existing 400 status. `assertNoRetiredTraceContent(value: unknown): void` in `document.ts` rejects retired block/component identities and active Markdown trace links at raw stored/legacy-document boundaries. It performs no conversion or resource access.
- Produces: optional `unsupportedContent?: "agent-traces"` on the internal `ReviewPublishEvaluationResult`. Import-only sentinel diagnostics set this classification and force no document result; `evaluateSealedReviewDocument` throws the typed error before materialization. JSON cutover catches only that typed classification into its existing skipped/report/log path; malformed supported content remains fatal.
- Produces: existing errors for unsupported saved/legacy blocks and resources, with no quote conversion. In import evaluation only, direct runtime `TraceQuote` exports and session `components.TraceQuote` resolve to a retired-component sentinel. The audit records a fatal unsupported-component diagnostic before best-effort expansion; direct invocation records the same diagnostic outside exception swallowing. No normal authoring component or transcript resolver survives. Keep sentinel creation/detection private to publication evaluation/audit modules.
- Inline targets: document validation uses existing Markdown parsing to reject actual links with `review-trace:` destinations. Literal/fenced code containing that string remains ordinary text. UI has no trace scheme handler.

- [ ] **Step 1: Write unsupported-content tests.** Assert current/historical stored documents with a trace_quote fail opening without calling resource/transcript loaders; a legacy JSX/sealed bundle using a direct TraceQuote import, alias, session.components lookup, nested local component or direct component call fails explicitly instead of returning a review missing its children. Exercise JSX and React.createElement as well as both `.bundle` and `.bundle/document` paths. Test ReviewStore.read directly for current/historical SQLite snapshots. Add a mixed-profile cutover test with a healthy legacy review, a trace review and Ask history: profile startup succeeds, only the unsupported review is reported/skipped, originals are untouched, and supported content/history reopen. Genuine malformed supported data must still fail cutover.
- [ ] **Step 2: Write authoring/upload tests.** Assert a trace resource upload is rejected before storing bytes, and trace_quote document edits fail the normal input schema. Exercise inline/reference `review-trace:` Markdown links through validation, while a fenced-code literal is accepted. Keep supported image/map uploads and ordinary quoting passing.
- [ ] **Step 3: Run red tests.** From `packages/review`: `bun --bun run vitest run --config vitest.config.ts src/review-api/local-data.test.ts src/review-api/store-import.test.ts src/review-api/store-read.test.ts src/review-import/legacy-blocks.test.ts src/review-import/import-review.test.ts src/review-import/json-cutover.test.ts src/publishing/review-publish-evaluate.test.ts`. Expect old accepted trace content to contradict rejection assertions.
- [ ] **Step 4: Remove block/resource/authoring support.** Delete quote schema/renderer exports, trace validation, trace resource references, publication quote collection/authentication and document text branches. Reject reserved trace link destinations using the existing parsed Markdown nodes; do not scan source strings or rewrite document history. In ReviewStore.read, validate the migrated/lifted document with documentSchema and checkReferences before returning either a stored or live snapshot. Convert rejection to the existing per-review input-error path without changing list metadata or rewriting rows.
- [ ] **Step 5: Remove import capture resolution.** Delete TraceRequest/TraceResolver and trace resource conversion, leaving supported source/map/image import intact. Old sourceSession/agentSessions input fields may remain accepted as ignored historical metadata where needed for non-trace reviews; they trigger no session lookup. Add the import-only sentinel/diagnostic guard to both named runtime imports and session component lookup; detect it before the audit walker catches component exceptions so retired quotes cannot disappear silently. Propagate the typed unsupported-content classification through raw legacy JSON and sealed evaluation into cutover's skipped/report path; preserve source directories and report other failures normally. Remove obsolete trace-only cases/fixtures rather than replacing them with text-conversion assertions.
- [ ] **Step 6: Record the document regression checks for the integration gate.** After Phase C, repeat Step 3 and run `bun --bun run vitest run --config vitest.config.ts src/review-import/legacy-review-fixtures.test.ts src/review-import/legacy-review-corpus.test.ts src/review-import/json-cutover.test.ts src/storage/stored-review-migration.test.ts src/storage/stored-review-source-migration.test.ts src/documents/review-document-data.test.ts`. Expect supported corpus/migrations to pass; retained trace fixtures, if any, explicitly assert rejection.
- [ ] **Step 7: Continue to Phase B.** Leave the integration uncommitted until all narrowed-union consumers and UI protocol callers have been removed.

### Phase B: Server, CLI, tools and sharing

**Files:**
- Modify: `packages/review/src/review-api/{http,agent-cli,mcp,authoring-tools,instructions}.ts` and `packages/review/src/cli/cli-runner.ts`.
- Delete: `packages/review/src/cli/{trace-cli,trace-storage-cli}.ts`, `packages/review/src/review-api/{traces,trace-schema}.ts` after their callers are removed, and trace-only tests/diagnostics.
- Modify: `packages/review/src/server/{desktop-server,tutorial-service}.ts`; `packages/review/src/sharing/{client,export,import}.ts`.
- Modify: `packages/review-protocol/src/{contracts,index}.ts`; `packages/review-share-protocol/src/index.ts`.
- Modify: `packages/agent-plugins/pi/skills/blackboard/SKILL.md`, `packages/review/instructions/authoring.md` and active agent/plugin guidance identified through trace-command references; delete `packages/review/instructions/trace-archaeology.md`. Leave README files unchanged.
- Test: `packages/review/src/review-api/{review-api,agent-client,instructions,ask-history,profile}.test.ts`; `packages/review/src/cli/{cli,cli-install}.test.ts`; `packages/review/src/sharing/{bundle,client,export,document,repository}.test.ts`; both protocol packages' schema tests.

**Interfaces:**
- Consumes: Task 1 identity client, Task 2 retirement integration, Phase A supported document/resources.
- Produces: `ShareManifest`/`ShareBundle` retain their existing shape and `review-share/1` wire format; resource kinds become `image | map`. Incoming metadata and cached-manifest parsing use this same strict schema; no ReceivedShareManifest or compatibility union.
- Produces: no trace routes, upload type, tool topic, CLI subcommand, capture/storage settings/status, protocol capture/status fields. Remove the trace view enum member and openTraceQuote action together with UI callers in Phase C. Retained login/logout/whoami and sharing publish/download/revoke signatures continue working.

- [ ] **Step 1: Write sharing rejection/integrity tests.** Assert remote metadata containing a trace resource fails before any signed-object download request; cached old trace manifests fail reopening without reading their resource bytes. Supported image/map bundles import/export, while digest mismatches, undeclared/duplicate objects, size limits and wrong source/map pins still reject. Export of a trace-containing snapshot rejects before resource access.
- [ ] **Step 2: Write removed-surface behavior tests.** Call removed HTTP endpoints and trace tools/CLI commands and assert normal unknown-route/tool/command failures with no hook or upload side effect. Exercise remaining agent canvas edits and sharing login/export/revoke. Avoid snapshots/assertions of the exact tool catalog or source strings.
- [ ] **Step 3: Run red tests.** From `packages/review`: `bun --bun run vitest run --config vitest.config.ts src/sharing/bundle.test.ts src/sharing/client.test.ts src/sharing/export.test.ts src/review-api/review-api.test.ts src/review-api/agent-client.test.ts src/cli/cli.test.ts`. Expect old accepted trace manifests/routes to fail the new behavior assertions.
- [ ] **Step 4: Remove server/command/tool surfaces.** Delete trace endpoints and injected context/runtime dependencies; remove desktop trace configuration/status and tutorial synthetic transcript uploads. Remove trace commands and account trace authorization callbacks/remedies. Update agent instructions to supported canvas/source/diff/Ask/sharing behavior. Keep installer retirement exclusively in Task 2 helpers.
- [ ] **Step 5: Tighten protocols and sharing.** Remove application trace schemas/re-exports and traceManaged from the normal stamp schema after raw installer evidence is handled. Narrow share resource kinds, remove transcript parsing/quote authentication/resource exports, and keep manifest byte/count/digest and supported resource/source checks intact. Do not change share format version or supported bundle layout.
- [ ] **Step 6: Record backend/protocol tests for the integration gate.** After Phase C, repeat Step 3; from `packages/review` run sharing document/repository and review-api instructions/ask-history/profile tests. Run `bun run --filter @dev.fast/review-protocol test` and `bun run --filter @dev.fast/review-share-protocol test` from root, then typecheck changed packages.
- [ ] **Step 7: Continue to Phase C.** Keep protocol view/navigation members until their UI callers are removed; commit the integration only after Phase C verification.

### Phase C: UI and tutorial, preserving Ask

**Files:**
- Delete: `packages/review/app/src/traces/`; `packages/review/app/src/settings/trace-capture-section.tsx` and its tests. Check callers before deleting any generic helper in that directory.
- Modify: `packages/review/app/src/App.tsx`; `review/{review-view-route,review-ui-state,canvas-query}.ts*`; `host/review-session-data.ts`; `documents/{api-document,blocks}.tsx`; `settings/settings-page.tsx`.
- Modify: `packages/review/app/src/tutorial/tutorial-plan.ts`, `tutorial-experience.tsx`, `tutorial-dynamic-content.tsx`; tutorial document at `packages/review/tutorial/document.json`; delete `packages/review/tutorial/trace.json`.
- Modify: `packages/review-protocol/src/contracts.ts` for trace view/navigation members; `packages/review/app/src/review/review-components.tsx` for transcript peeks.
- Modify: trace-only telemetry branches discovered from deleted UI callers; preserve startup spans.
- Test: `packages/review/app/src/host/electrobun-shell.browser.test.tsx`; document/route/UI-state tests; `tutorial/{tutorial-experience,tutorial-dynamic-content}.browser.test.tsx`; retained Ask/session/sharing tests.

**Interfaces:**
- Consumes: Phase B backend surfaces and Phase A supported document blocks; remove protocol view/navigation fields in this phase alongside UI callers.
- Produces: canvas/Ask navigation and settings with no trace state/query/resource loader/action. Persisted obsolete view preferences fall back to the normal supported canvas view; Ask session/history interfaces stay unchanged.

- [ ] **Step 1: Write retained-flow tests.** Load old UI preferences selecting trace and assert the canvas opens without a transcript request. Reopen an existing Ask conversation in a trace-enabled profile fixture and assert its questions/answers persist. Exercise canvas editing, source/diff navigation and sharing controls after view removal. Keep browser tests behavioral rather than exact menu-text snapshots.
- [ ] **Step 2: Run red tests.** Ensure tutorial assets with `bun run --filter @dev.fast/review ensure:tutorial-assets`. From `packages/review/app`: `bun --bun run vitest run --config vitest.config.ts --project browser src/host/electrobun-shell.browser.test.tsx src/review/review-ui-state.browser.test.ts`. Expect the old trace preference to render the retired view/request instead of the canvas fallback.
- [ ] **Step 3: Remove trace UI callers and components.** Delete playback/list/call-tree/quote UI and trace settings, navigation, loaders, queries and protocol actions. Remove only trace telemetry events; retain startup spans and diagram drawing motion. Normalize stale trace preference values through the existing preference validation/fallback boundary.
- [ ] **Step 4: Remove tutorial capture content.** Delete the Agent traces section, synthetic resource and related tutorial plan/dynamic controls; regenerate tutorial assets using the existing script. Keep canvas/source/diff/diagram/Ask tutorial flows.
- [ ] **Step 5: Run the integration green checks.** Run Phase A/B regression commands and changed package typechecks after all deletion phases finish. From root run `bun run --filter @dev.fast/review-canvas test:node` and `bun run --filter @dev.fast/review-canvas test:browser`, plus `bun run --filter @dev.fast/review check:tutorial`. Compare any failures with Task 1's baseline and resolve regressions. Run the canvas typecheck.
- [ ] **Step 6: Commit the verified integration.** Stage explicit document/import/server/protocol/CLI/sharing/UI/tutorial/instruction/telemetry files and tests from Phases A–C; `git commit -m "refactor: remove agent trace feature across Blackboard"`.

## Task 4: Delete trace packages and repair build/release graph

**Files:**
- Delete: `packages/trace-core/` and `packages/trace-protocol/`.
- Modify: `packages/review/package.json`, `packages/review/app/package.json`, `packages/review-protocol/package.json`, `bun.lock`, `tsconfig.base.json`, `apps/review-electrobun/tsconfig.json`.
- Modify: `packages/review/{test-config,tsdown.config}.ts`; `.github/workflows/review-cli-release.yml`; `scripts/smoke-review-cli.mjs`; connected staging/package scripts only where imports/assets require it.
- Test: `scripts/{stage-review-assets,review-cli-dependencies,review-cli-release}.test.mjs` and installed-tarball smoke tests.

**Interfaces:**
- Consumes: all retained consumers moved/removed in Tasks 1–3; installer-only retirement helpers contain no trace-package imports.
- Produces: workspace manifests, TypeScript paths, test aliases, bundler/dts graph and release workflows resolving without either trace package; CLI artifact retains headless canvas and sharing.

- [ ] **Step 1: Audit active dependencies.** Run `rg -n '@dev.fast/trace-(core|protocol)|packages/trace-(core|protocol)' packages apps scripts .github tsconfig.base.json`. Classify each remaining consumer and finish moving/removing active ones. Keep historical documentation untouched; remaining trace words are allowed only for cleanup/rejection tests, historical docs and unrelated diagnostic/diagram terminology.
- [ ] **Step 2: Delete packages and dependencies.** Remove both directories and their dependency/path/test/bundler entries, then regenerate `bun.lock` with the selected runtime. Remove obsolete release trace tests and correct the existing workflow installer test path to `src/cli/cli-install.test.ts`. Remove installed-tarball smoke steps that install/uninstall capture hooks; retain supported CLI/headless/sharing smoke behavior with temporary profiles.
- [ ] **Step 3: Verify build graph.** Run `bun install --frozen-lockfile`, `bun test scripts/stage-review-assets.test.mjs scripts/review-cli-dependencies.test.mjs scripts/review-cli-release.test.mjs`, and `bun run typecheck`. Expect no deleted workspace package, alias or bundled module references. Pack locally via `packReviewCli({version, commit}, outputDirectory)` from `scripts/pack-review-cli.mjs`, with the existing package version and current HEAD, then run `bun scripts/smoke-review-cli.mjs <returned-tarball> <version>`. The packer temporarily rewrites/restores the manifest; verify restoration. Supply temporary profiles and no real hook installation; do not invoke release tagging or publishing.
- [ ] **Step 4: Commit package removal.** Stage explicit manifests/lock/config/workflow/scripts and package deletions; `git commit -m "refactor: delete trace packages and release dependencies"`.

## Task 5: Verify retained product and replace the diagram

**Files:**
- Update checked architecture artifact from `.archify/architecture-blackboard-overview-20261010-224417/{candidate.json,blackboard-overview.html}` through Archify; create a new checked output before replacing the prior diagram.
- Update this plan's checkboxes and the implementation verification log; product changes only to resolve demonstrated regressions.

**Interfaces:**
- Consumes: the implemented removal, baseline results, temporary upgrade fixtures and the original diagram.
- Produces: passing affected checks or clearly documented unchanged baseline failures; validated diagram reflecting actual final modules and preserved Ask/sharing; no active capture or playback path.

- [ ] **Step 1: Run final acceptance checks.** From root: `bun run --filter @dev.fast/review test`, `bun run --filter @dev.fast/review-canvas test:node`, `bun run --filter @dev.fast/review-canvas test:browser`, `bun run typecheck`, `bun run lint`, `bun run format:check`, and `bun run desktop:build`. Run the affected protocol/script checks from Tasks 3/4. Record exact failures and baseline comparisons; do not claim a full pass when checks fail.
- [ ] **Step 2: Exercise the built app with an isolated profile.** Prefer T3 preview tools for browser inspection. Verify supported view switching/settings/tutorial, canvas authoring, source/semantic diff navigation, reopening Ask history and sharing flows. Confirm no trace requests or hook creation on fresh install and owned-only cleanup on temporary upgrade fixtures. Preserve real user files and credentials throughout.
- [ ] **Step 3: Audit removal completeness.** Repeat active dependency search and inspect remaining `trace_quote`, `TraceQuote`, `review-trace:`, capture-command and Agent-Session generation references. Each remaining reference needs an allowed purpose (retirement/rejection, unrelated diagnostics, or historical docs). Confirm new shares cannot contain transcripts and malformed supported resources/pins still reject.
- [ ] **Step 4: Rebuild and validate the architecture diagram.** Read/use Archify, inspect the final code and generate an updated standalone diagram without trace nodes, storage or hooks; retain Ask/history, authoring/API, review storage, canvas, source/diff and sharing. Run its required structural/showcase/browser checks. Leave the old artifact intact until the replacement passes.
- [ ] **Step 5: Request the execution method's fresh review.** Review the whole branch against the amended design, including ownership safety, retained auth/history, unsupported old-review rejection, dependency removal and acceptance evidence. Resolve actionable findings and rerun only affected checks.
- [ ] **Step 6: Commit validated diagram and verification notes.** Stage only newly validated diagram outputs and explicit planning/verification documents; `git commit -m "docs: update architecture after trace removal"`. Report completed scope, unsupported old trace reviews, validation results and any remaining baseline failures.

## Execution handoff

Read the amended design and this plan before implementation. Native execution is recommended because utility extraction, installer retirement, protocol removal and package deletion share interfaces and run sequentially. Use one fresh whole-branch reviewer at the end; subagent-driven execution remains available if the user prefers per-task independent review.
