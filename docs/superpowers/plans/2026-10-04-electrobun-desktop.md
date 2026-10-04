# Electrobun Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing review product in a separate macOS Electrobun development app, including real reviews, Pierre peeks/diffs, diagrams, search, and external VS Code navigation.

**Architecture:** One Cottontail main process owns a system-webview window and a Node 24 server child. A React shell mounts existing canvas instances and fetches authenticated server data directly; typed RPC carries bootstrap, preferences, and native operations. Keep today's desktop available while validating the new host.

**Tech Stack:** Electrobun 2.0.2 through Hutch; pnpm 11.1.2; Node >=24 <25; existing React 19.2.5, Vite 8.0.16, TypeScript, Vitest 4.1.11, Pierre Diffs 1.5.1, StyleX, React Flow, and libavoid WASM.

**Spec:** [Approved design](../specs/2026-10-04-electrobun-desktop-design.md). Approved by the user on 2026-10-04. Implementation awaits plan review and execution-method selection.

## Global Constraints

- New app: `apps/review-electrobun`, workspace package `@dev.fast/review-electrobun`.
- Pin Electrobun `2.0.2`; use Cottontail and the platform webview, initially WKWebView on macOS. CEF is outside the initial configuration.
- Run `packages/review/dist/server/desktop-host.js` on Node 24. No Code OSS or Electron build prerequisite.
- Use a dedicated Electrobun data directory by default; honor an explicitly supplied `DEV_REVIEW_HOME`.
- Retain response status/body/headers and cancellation; do not serialize all data through RPC or buffer server event streams.
- No Monaco models, VS Code extension host, Code OSS editor groups, or Code OSS service imports.
- No Code OSS deletion or replacement of default launch commands belongs to this milestone.
- Production distribution, updates/signing, extension settings, Ask configuration UI, telemetry parity, automatic CLI shim installation, and multiwindow behavior are outside this milestone.
- Do not edit README.md. Do not add change-detector tests. Delete an encountered change-detector test instead of updating it and ask its author about replacement.
- Keep pnpm's lockfile authoritative. Use the prepared SDK's aliases; the npm `electrobun` package is a bootstrap launcher, not an application SDK dependency.

## Review Focus

- Partial stdout frames, slow migration, and early child exit: startup either validates the complete ready record or shows a specific error; Task 2 tests these.
- A redirected HTTP request or foreign origin: the launch token never leaves the sidecar origin; Task 4 tests these.
- Paths containing spaces, Unicode, shell syntax, and renamed base-side files: source launching preserves pins and coordinates using argument vectors; Task 3 tests these.
- Corrupt persisted preferences or removed reviews: restoration uses valid defaults and drops missing tabs without changing catalog data; Task 5 tests these.
- A closed tab, disposed menu, or terminated server: owned streams/focus/subscriptions are released and stale controls are disabled; Tasks 4–6 test these.

## Files and boundaries

| Path | Responsibility |
| --- | --- |
| `apps/review-electrobun/package.json`, `hutch.config.ts`, `electrobun.config.ts`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `index.html` | App identity, pinned SDK, workspace scripts, frontend bundling, typechecking and behavior-test lane. |
| `apps/review-electrobun/scripts/dev.mjs` | Node/Hutch preflight, shared server/frontend build, explicit dev launch environment. |
| `apps/review-electrobun/src/main.ts` | Native window, RPC wiring, application menu, startup/error state and shutdown. |
| `apps/review-electrobun/src/server-host.ts` | Node child, discovery/readiness, instance/profile isolation, bounded shutdown. |
| `apps/review-electrobun/src/native.ts` | Persisted shell preferences, validated source resolution, VS Code/external URL launching. |
| `apps/review-electrobun/src/rpc.ts` | Shared RPC schemas and runtime validation at privileged boundaries. |
| `apps/review-electrobun/src/bridge.ts` | Authenticated browser transport, control relay and per-review canvas adapter. |
| `apps/review-electrobun/src/shell.tsx`, `shell.css` | Home/review tabs, canvas lifetime, settings, menu/dialog adapter and notifications. |
| `apps/review-electrobun/src/server-host.test.ts`, `native.test.ts`, `bridge.test.ts` | Process, filesystem, source-launch and HTTP/control behavior. |
| `packages/review/app/src/electrobun-shell.browser.test.tsx`, `desktop-entry.browser.test.tsx` | Shell and shared mounting behavior in the existing canvas browser-test lane. |
| `packages/review/src/desktop-discovery.ts`, `desktop-discovery.test.ts` | Optional validated dev-host key override. |
| `packages/review-protocol/src/review-event-stream.ts`, `review-event-stream.test.ts`, `index.ts`, `package.json`; native `common/reviewEventStream.ts` | Share the existing pure SSE framing implementation without importing fork services. |
| `packages/review-protocol/src/contracts.ts`, `packages/review/app/src/api-canvas.tsx`, `desktop-entry.tsx` | Remove obsolete editor requirement and expose explicit shell theme authority. |
| `packages/review/app/desktop.vite.config.ts` | Reuse existing canvas compilation plugins/assets for the new HTML entry. |
| Root `package.json`, `.gitignore`, `pnpm-lock.yaml` | Explicit new launch commands, generated output ignores and workspace dependency resolution. |
| `docs/superpowers/validation/2026-10-04-electrobun-desktop.md` | Actual native smoke results, versions, remaining failures and limitations. |

Keep helpers in their owning files; do not introduce a general desktop-framework abstraction. Read root instructions and both this plan and its spec before execution. Use the selected native/subagent execution skill; establish workspace placement through the worktree skill, honoring the user's selection to work here if supplied.

## Shared interfaces

Define these in `src/rpc.ts`; reuse protocol types rather than copying their fields:

```ts
type ShellPreferences = {
  theme: "system" | "light" | "dark";
  diffLayout: ReviewDiffLayout;
  reviewIds: string[];
  activeReviewId: string | null; // null selects Home
};
type HostState =
  | { status: "starting"; message: string }
  | { status: "ready"; connection: ReviewDesktopDiscovery;
      appSessionId: string; appVersion: string; preferences: ShellPreferences }
  | { status: "error" | "disconnected"; message: string };
type NativeOpenRequest =
  | { kind: "workspace"; view: ReviewSourceView }
  | { kind: "file"; location: ReviewApiSourceLocation; range?: ReviewInlineEditorRange }
  | { kind: "diff"; view: ReviewSourceView; file: string };
```

The SDK's RPC schema retains its `bun` namespace for main-process requests even under Cottontail. Requests: `getState(): HostState`, `setPreferences(ShellPreferences): ShellPreferences`, `openSource(NativeOpenRequest): void`, `openExternal({url: string}): void`, and `focusWindow(): void`. Main-to-webview messages: `hostState(HostState)` and `command({name: "find" | "home" | "settings" | "closeTab"})`. Validate native request payloads once at this boundary; trusted downstream code uses the parsed value.

### Task 1: Build and exercise the native rendering path

**Files:** App configuration/manifest/entry, `scripts/dev.mjs`, initial `src/main.ts` and `shell.tsx`, root scripts/ignore file; reuse `packages/review/app/desktop.vite.config.ts`.

**Interfaces:** Produces `pnpm electrobun:build` and `pnpm electrobun:dev`. The frontend entry imports `mountReviewCanvas` from the existing canvas source using the existing aliases and compilation plugins. The renderer uses the prepared SDK's `electrobun/browser` projection; main imports `electrobun/main`.

- [ ] Confirm existing workspace placement and install only the tooling needed by this task. Prepare Hutch's Electrobun 2.0.2 devkit with pnpm selected; leave generated `.hutch`, build and dist outputs ignored. Add existing-version workspace dependencies without a second lockfile.
- [ ] Make the canvas Vite configuration reusable as a factory while preserving its default existing desktop export. The Electrobun config supplies its HTML input/output and SDK aliases; reuse StyleX, React dedupe, source aliases, font handling, Pierre/libavoid transforms, and canvas CSS scoping. Bundle libavoid WASM as an application asset and provide its absolute application URL.
- [ ] Create the native window with bundled `views://mainview/index.html`, `bundleCEF: false`, and allowlisted application navigation. Add explicit root launch/build commands; leave `dev` and `desktop:*` intact. The dev script builds the existing server through its workspace script and provides its absolute entry and selected Node executable to main.
- [ ] Run a temporary native probe that reuses the fixture bridge with explicit nonempty `/diff` and base/head `/file` responses; its default fixture responses cannot exercise Pierre. Supply the bundled application WASM URL, render visible code rows and a peek, highlight an actual search match, and confirm diagram edge paths have been produced by the router. Check fonts/CSS scope and `CSS.highlights`/`Highlight`. Exercise Cottontail child spawning with the selected Node executable and read its stdout/exit status; use a temporary loopback HTTP endpoint to check authenticated fetch, streaming and cancellation from the `views://` renderer. Remove probe-only code before the final host is shipped.
- [ ] Run `pnpm electrobun:build`; expect a native dev bundle and frontend assets without invoking Code OSS. Record actual macOS/webview/Electrobun/Cottontail versions and probe outcomes. A renderer or process-API failure must be investigated before proceeding; changing the selected runtime/renderer requires explaining the evidence to the user.
- [ ] Commit the working build/native-rendering seam.

### Task 2: Own the Node server and a separate instance

**Files:** `src/server-host.ts`, `server-host.test.ts`, shared desktop discovery files, `src/main.ts`, launch script.

**Interfaces:** `startServer(options: {nodePath: string; entryPath: string; checkout: string; profile: string; appVersion: string; appSessionId: string}, onState: (state: Exclude<HostState, {status: "ready"}>) => void): Promise<{connection: ReviewDesktopDiscovery; stop(): Promise<void>}>`. Main combines the returned discovery and preferences into ready state in Task 3. Add host-only environment variable `DEV_FAST_REVIEW_INSTANCE_KEY` to `reviewInstanceIdentity`.

- [ ] Write failing tests for unchanged identity with no override; a valid `dev-…-electrobun` override for a checkout; and rejection of traversal, stable/preview overrides, or an override without a dev checkout. Keep `DEV_REVIEW_INSTANCE` as the existing CLI selection variable.
- [ ] Write child-lifecycle behavior tests: split JSON ready frames, migration then ready, mismatched PID/instance/token, early exit, timeout, a duplicate running instance with no renderer attached, and idempotent bounded stop. Use a controlled child that emits real framed stdout for parsing/shutdown checks. Assert discovery cleanup and no orphan PID after stopping.
- [ ] Run `pnpm --filter @dev.fast/review exec vitest run src/desktop-discovery.test.ts` and the new app's `server-host.test.ts`; confirm the new behaviors fail before implementation.
- [ ] Implement the dev-key override and child host using the documented Node-compatible `node:child_process` API. Preserve the existing environment contract, private token, app/session identifiers, Node CLI runtime, port `0`, and isolated profile. Before launching, reject an occupied profile/key using authenticated sidecar health matched to the recorded instance/server PID, independently of `desktopAttached`; do not reuse the CLI's attachment-dependent `isHealthyReviewDesktop` predicate. Parse complete stdout lines, validate ready discovery with the existing protocol parser and match it to launch identity, surface migration/error state, and bound startup at 120 seconds.
- [ ] On quit send SIGTERM, wait up to 5 seconds, then SIGKILL and reap the child if needed. On unexpected child exit emit disconnected state. Do not add automatic restart. Print only profile/key instructions for selecting the app from the CLI.
- [ ] Run the focused tests again; expect passing identity/lifecycle behavior. Start the native app and observe a valid sidecar ready record; quit and confirm its child is gone. Commit.

### Task 3: Wire native RPC, preferences, and external source opening

**Files:** `src/rpc.ts`, `native.ts`, `native.test.ts`, `main.ts`.

**Interfaces:** Shared RPC/types above; `readPreferences(file: string): Promise<ShellPreferences>`, `writePreferences(file: string, preferences: ShellPreferences): Promise<void>`, and `openSource(connection: ReviewDesktopDiscovery, request: NativeOpenRequest): Promise<void>`. Native window uses `activate()` to focus. The synchronous `before-quit` handler cancels the first quit and retries it after cleanup completes.

- [ ] Write failing behavior tests for preference persistence/defaults; invalid theme/layout/tab data; malformed privileged requests; missing VS Code; nonzero launch exit; and paths with spaces, Unicode and shell syntax. A pinned renamed-base source test must assert navigator query and resulting argument vector, with range start line and column 1. Diff tests must cover renamed, added and deleted files including each empty side. Test repeated quit requests: synchronous cancellation, exactly one cleanup, and one retry only after cleanup has completed.
- [ ] Run `pnpm --filter @dev.fast/review-electrobun exec vitest run src/native.test.ts`; expect the unimplemented behavior to fail.
- [ ] Define the runtime-validated RPC boundary and wire `BrowserView.defineRPC`/`Electroview.defineRPC`. Main exposes current state immediately and publishes migration/ready/disconnected changes. No caller may supply an executable, arbitrary shell command, server token, or server origin.
- [ ] Store preferences atomically in the isolated app profile using the existing private-JSON writer where it is Cottontail-compatible; otherwise use a local temporary-file/rename operation. Defaults: system theme, split diff layout, no review tabs, Home active. Missing/corrupt preferences fall back without touching server data; a failed save reports an error and retains the last saved state.
- [ ] Resolve source via authenticated `POST /reviews-api/:id/navigator`, forwarding `reviewSourceQuery`, each reference's pins, side and file. For a diff, first read its pinned manifest: base uses `previousPath` when renamed; added base/deleted head uses the existing navigator `empty=true` option. Use `code`/the installed macOS VS Code command with an argument vector, `--new-window` workspace plus `--goto file:line:1` when a range exists, or `--diff base head`. A file open without a range uses its resolved file path. Resolve executable availability and surface failure. External URLs use the SDK system handler and allow exactly `http:`, `https:`, and `mailto:`; intercept external link activation so remote content never loads into the privileged view.
- [ ] Wire the native application menu and guarded quit behavior for menu, last-window and application quit. Electrobun does not await event-handler promises: synchronously set `event.response = {allow: false}`, start one idempotent stream/persistence/Task 2 cleanup promise, then set a quit-complete guard and explicitly retry `Utils.quit()`. The retried handler allows quitting. Run the focused tests and native source-opening/quit smoke; expect pinned destinations in external VS Code and the server reaped before the host exits. Commit.

### Task 4: Implement authenticated transport and the canvas adapter

**Files:** `src/bridge.ts`, `bridge.test.ts`, protocol contracts, `api-canvas.tsx`, and existing fixture/test bridges with actual consumers.

**Interfaces:** `createAuthenticatedRequest(connection: ReviewDesktopDiscovery): ReviewCanvasBridge["request"]`; `connectControl(request: ReviewCanvasBridge["request"], dispatch: (request: ReviewVerbRequest) => Promise<ReviewVerbResponse>, signal: AbortSignal): Promise<void>`; `createCanvasBridge(options: {state: Extract<HostState, {status: "ready"}>; reviewId: string; wasmUrl: string; request: ReviewCanvasBridge["request"]; post: ReviewCanvasBridge["post"]; preferences: {current(): ShellPreferences; subscribe(listener: () => void): ReviewDisposable; set(next: ShellPreferences): Promise<void>}; notify: NonNullable<ReviewCanvasBridge["notify"]>}): ReviewCanvasBridge`.

- [ ] Write failing tests for authenticated same-origin requests preserving status/headers/body, rejection before fetching a foreign origin, rejected redirects, live body streaming and abort, control-frame/result pairing, malformed control frames and disposal. Verify errors become truthful `ReviewVerbResponse` failures.
- [ ] Run `pnpm --filter @dev.fast/review-electrobun exec vitest run src/bridge.test.ts`; expect failure for the new adapter.
- [ ] Implement direct fetch confined to the sidecar origin with `x-review-token`, caller signals and `redirect: "error"`. Parse control frames/results with existing protocol parsers. Move the pure implementation from native `common/reviewEventStream.ts` into protocol `src/review-event-stream.ts`, pin existing `eventsource-parser` 3.1.1 there, export it and re-export it through the old native helper. Add behavior tests for chunked/multiline framing, size limits, abort and reader release; make control-result/handler failures observable rather than swallowed in the consumer. Own control lifetime at the application, not each tab. Surface control loss and disable dependent actions; reconnect only while the server is alive, disposing previous readers.
- [ ] Reuse `ReviewApiClient`, its catalog/live subscription mechanism, existing source-view helpers, and diff response parsers. The canvas bridge's `diffView.files(scope)` forwards scope/pins/mode to the existing manifest API; request/post/surface events retain existing semantics. Provide theme/layout subscriptions and a notification sink. Main state controls disconnection.
- [ ] Trace every `bridge.inlineEditors` read. Remove the required property and its obsolete copy in `api-canvas.tsx` once the active React renderer has no consumer. Keep Pierre's `ReviewInlineEditorFactory` types. Update actual typed fixture consumers and the current host as required; do not delete native services as part of this task.
- [ ] Run focused new-app tests, `pnpm --filter @dev.fast/review-protocol exec vitest run src/review-event-stream.test.ts`, and protocol/canvas typechecks. Commit.

### Task 5: Make Home and review tabs usable

**Files:** `src/shell.tsx`, `shell.css`, `packages/review/app/src/electrobun-shell.browser.test.tsx`; Task 4 bridge dispatch.

**Interfaces:** `mountElectrobunShell(container: HTMLElement, options: {state: Extract<HostState, {status: "ready"}>; rpc: AppRPCClient; wasmUrl: string}): ReviewDisposable`, where `AppRPCClient` is the renderer SDK RPC client defined in `rpc.ts`. Tab commands own canvas handles and dispatch control requests.

- [ ] Write failing browser behavior tests for opening the same review twice, retaining tab-local navigation when switching, dropping a removed review on restoration, closing/disposal, and error/disconnected states. Assert visible behavior and ownership cleanup, never source/import shapes or exact markup.
- [ ] Run `pnpm --filter @dev.fast/review-canvas exec vitest run --config vitest.config.ts --project browser src/electrobun-shell.browser.test.tsx`; expect unimplemented shell behavior to fail. The browser test substitutes typed native RPC and HTTP fixtures, using existing React/StyleX test setup; it does not import the native SDK.
- [ ] Implement Home using the existing `ReviewCanvasContent` Home callbacks and authenticated catalog updates. Reuse existing lifecycle API operations for delete/dismiss/restore, close affected tabs, and propagate errors. Home's tutorial action uses `/tutorial/prepare` and `/tutorial/open`; reuse the existing tutorial protocol/progress where needed.
- [ ] Keep one canvas mount per open review and a singleton Home mount. Hide inactive mounts while retaining local state; notify a resumed mount through `REVIEW_CANVAS_RESUME_EVENT`, focus it and dispose closed mounts. Filter restored IDs against the catalog, normalize an invalid active tab to Home, and persist open IDs/active selection through Task 3 preferences.
- [ ] Implement `openApiReview`, `authoringCapabilities`, and `focusWindow` for the control relay. Set capability flags to actual canvas support. Canvas dispatch handles revision/document/diff/navigation events and uses current `ReviewSourceView`; source opens go through Task 3. An unsupported verb returns an error rather than fake success.
- [ ] Run focused browser and bridge tests. In the native app, open tutorial and a real review through Home and an existing CLI/authoring call targeted with the printed profile/key; expect the correct tab to open and the window to activate. Commit.

### Task 6: Preserve theme, menus, find, and keyboard behavior

**Files:** `src/shell.tsx`, `shell.css`, `src/main.ts`, protocol canvas UI contract, shared `desktop-entry.tsx`, `desktop-entry.browser.test.tsx`, shell browser tests.

**Interfaces:** Add optional `ReviewCanvasUi.theme: {current(): ReviewTheme; subscribe(listener: (theme: ReviewTheme) => void): ReviewDisposable}`. Review canvases continue using their bridge theme; non-review pages use this explicit source when supplied, retaining the existing workbench source otherwise. `ReviewCanvasUi.showMenu`/`confirmDelete` keep their existing signatures.

- [ ] Write failing browser tests for Home changing theme without a workbench element; disposing the explicit theme subscription; menu keyboard selection/Escape/trigger focus restoration; confirming and cancelling deletion; and Cmd/Ctrl+F affecting the active canvas only. Add tab-navigation/close and system-theme preference behavior to shell tests.
- [ ] Run the focused browser files; expect the new behavior to fail. Implement the shared mounting theme seam, app preference controls for system/light/dark and split/unified, `matchMedia` system appearance, and bridge updates to all open views.
- [ ] Implement the canvas UI adapter with existing option-menu/popover/focus helpers and a native or app-owned confirmation dialog. Retain enabled/checked items, action errors and disposal. Keep these menu operations asynchronous where the contract requires it. Style shell controls using existing design tokens; apply Interface Kit during implementation.
- [ ] Wire native menu commands and keyboard shortcuts to Home/settings, active-canvas find, tab switching/closing; preserve normal input editing shortcuts. Notifications and startup/disconnection errors must be visible. Tooltip behavior may use existing frontend helpers; it must not require native hovers.
- [ ] Run targeted browser tests and native interaction smoke. Expect Home/reviews to follow preferences, find to work inside Pierre peeks, menus/dialogs to return focus, and preferences to survive restart. Commit.

### Task 7: Validate the complete first milestone and record the result

**Files:** All affected product files as needed for concrete failures; native validation record.

**Interfaces:** The acceptance checklist in the approved design is the completion boundary. No new app features are added here.

- [ ] Remove temporary probe code, unused imports/dependencies and fake handlers. Run the smallest complete verification set once after the changes: new-app build/typecheck/tests, protocol/canvas typechecks, affected canvas browser/node behavior tests, shared discovery tests, and current desktop typecheck for changed shared contracts. Run scoped formatting/lint on changed product files. Broaden only for failures or unresolved concerns.
- [ ] Launch the final native development bundle on WKWebView and exercise every design acceptance item: document/diff/commit comparison/Pierre peeks; original and renamed source identities; search/highlights/copy/progress/layout; sequence/flow/software-map routing/call-tree/math; source/VS Code failures; theme/tab restoration; menus/focus; server crash; app shutdown; and coexistence with the old app. Use T3 preview tools if they can attach; if unavailable for this native view, use app diagnostics and a concrete native/manual smoke rather than claiming a browser fixture proves WKWebView.
- [ ] Record commands/results, exact versions, native screenshots/diagnostics when available, PID/discovery cleanup, and any failed or unexercised acceptance item. Do not mark complete while a required native check remains unverified. Investigate a failure before patching it; update the plan/design if evidence changes an architectural decision.
- [ ] Run the completion review required by the selected execution skill without repeating successful checks. Fix evidenced findings, rerun only checks invalidated by changes, and commit the final app and validation record. Report launch command, capabilities and remaining distribution work.

## Decisions, rollback, and research

The initial goal is a separate working development app. Preserving Node protects the existing SQLite/tool runtime; using the system webview tests the intended small shell directly. If that renderer fails the early probe, stop and present the failure before changing the selected configuration. Keep old launch/build commands and isolated data untouched, so returning to today's desktop requires no data migration.

Primary references checked against the `v2.0.2` tag on 2026-10-04: [Cottontail runtime compatibility](https://github.com/blackboardsh/electrobun/blob/v2.0.2/docs/src/content/docs/electrobun/guides/cottontail.mdx), [project/SDK ownership](https://github.com/blackboardsh/electrobun/blob/v2.0.2/docs/src/content/docs/electrobun/guides/project-ownership.mdx), [React/Vite template](https://github.com/blackboardsh/electrobun/tree/v2.0.2/templates/react-tailwind-vite), [window lifecycle](https://github.com/blackboardsh/electrobun/blob/v2.0.2/docs/src/content/docs/electrobun/apis/browser-window.mdx), and [webview/RPC/navigation](https://github.com/blackboardsh/electrobun/blob/v2.0.2/docs/src/content/docs/electrobun/apis/browser-view.mdx). Runtime compatibility remains an acceptance check, not an inferred guarantee from the documentation.

Recommended execution: native in this session, because the seven tasks share the same bridge, process and canvas interfaces. Choose subagent-driven execution if separate implementation/review gates per task are preferred. Review the plan and select the execution method before product implementation.

## Plan review

Frozen draft: commit `4ff332a`. An isolated Junior to Senior review found one lifecycle blocker and two major gaps; this revision addresses them without changing the approved scope:

- Quit handlers are synchronous: cancel, clean up, and retry instead of assuming the emitter awaits a promise. Primary source, checked 2026-10-04: [Electrobun events](https://github.com/blackboardsh/electrobun/blob/v2.0.2/docs/src/content/docs/electrobun/apis/events.mdx).
- The default fixture has empty diffs and no source-file responses: Task 1 now supplies nonempty data and exercises native routing and authenticated streaming.
- CLI health requires an attached renderer: Task 2 checks sidecar occupancy independently and tests a running-but-unattached instance.

The review also clarified optional ranges/column 1, rename/add/delete source resolution, server-state typing, explicit SSE extraction, and allowed external URL schemes. No additional product decisions were needed. Required native acceptance checks remain pending until implementation.
