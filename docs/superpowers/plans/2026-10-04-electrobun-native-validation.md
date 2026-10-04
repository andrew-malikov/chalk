# Electrobun native validation

## Rendering probe — 2026-10-04

macOS arm64; Electrobun 2.0.2; Hutch 0.27.1; Cottontail 0.7.1; Node sidecar 24.21.0. Used the platform WKWebView, without CEF or a Code OSS build.

A temporary fixture supplied nonempty before/after TypeScript and a modified-file manifest to the actual Pierre inline factory. A flow diagram used the bundled libavoid application URL. A real Node child exposed authenticated loopback HTTP and a streaming response. The probe used the native SDK RPC, then quit through before-quit cancellation, child shutdown, and an explicit quit retry. The fixture and diagnostic preload were removed after this probe.

Observed: six rendered code rows; one search match; two CSS Highlight entries; one SVG routed edge; no reported renderer alerts. Authenticated fetch returned `{ok:true}`; streaming returned `first\n`, followed by cancellation. WASM loaded from `views://mainview/assets/libavoid-BRQRZjmQ.wasm`. Native shutdown reported child exit 0. Canvas font resolved to Geist Mono.

SDK preparation exports the browser entry as `electrobun/view`; use that generated export rather than the documentation’s `electrobun/browser`. Direct fixture-style `new URL` asset resolution is required for the unexported libavoid WASM subpath.

Temporary raw diagnostics remain in the ignored execution scratch. This establishes the renderer/build seam; it does not establish complete application behavior.

## Application acceptance

Executed the complete application in WKWebView using a real Node sidecar and an isolated profile. Temporary main-process JavaScript diagnostics were removed after acceptance; they are absent from product source. Authenticated requests used owned discovery credentials without including them in this record.

| Behavior | Observed result |
| --- | --- |
| Home / tutorial | Direct Home Tutorial prepares and opens the real shipped document. Its initial sequence/database/map/code content renders without alerts: 46 Pierre rows and nine map nodes. Opening sequence supporting source expands to six peeks / 164 rows. |
| Agent open / incoming review | Real HTTP open returns 200 and `softwareMapEnabled:true`; review opens and focuses. Regression tests also cover a review arriving after catalog load. |
| Authored document | Markdown, two KaTeX nodes, a call-tree comparison, and a two-node flow render. The flow edge has routed SVG geometry. The initial native probe separately verifies bundled libavoid WASM loading. |
| Full diff / commit comparison | Two actual changed files render in Pierre (31 rows in split layout); the real commit comparison opens without alerts. |
| Progress | Marking inventory viewed changes its control to Mark unviewed and removes it from the pending diff lens. |
| Find / clipboard | Cmd+F and `Searchneedle` produce `1 of 1` and two CSS Highlight entries. Copy head commit puts the exact pinned SHA on the system clipboard. |
| Appearance / layout | Light and dark apply; unified renders `single` layouts with 21 rows. System appearance is covered by browser regression. Restart restores dark/unified, retained review tabs, and the active review. |
| Source identity | A real Git rename with spaces/Unicode resolves the previous base path and renamed head path. Real pinned navigator workspaces open through a controlled `code` executable: literal base/head paths and `--goto …:2:1` coordinates match the requested sides. Source tree opens the pinned workspace. The native `--diff` argument path is covered by host/bridge tests. |
| Menus / focus | WKWebView Popover opens checked Unified; ArrowDown/Escape dismisses and restores Diff settings focus. Settings uses native modal dialog and restores its trigger on close. Browser tests cover tabs, delete confirmation/cancellation/owner disposal, menu selection and stream cleanup. |
| VS Code failure | A controlled executable failure produces an actionable notification. Missing executable and literal shell-character arguments are covered by host tests. |
| Sidecar crash | Killing only the owned sidecar shows `Review server exited (SIGKILL).`, disposes the shell, and leaves zero tabs/stale controls. |
| Shutdown / coexistence | Both apps concurrently return authenticated healthy/attached state under distinct `dev-electrobun-…` and `dev-whiteboard-…` keys and sidecars. Guarded native quit exits 0; owned old-app shutdown exits 0; both isolated discovery directories become empty. |

Native acceptance found and corrected three real integration defects: strict diff routes rejected a supplied `mode`; agent-open acknowledgments lacked the server-required capability result; and catalog-miss reads returned numbered inspection text instead of a full snapshot. Tests now validate the authoritative diff query schema, required acknowledgment result, and incoming full-document behavior. Home additionally provides direct Tutorial access because CLI installation is deferred.

The source fixture initially lived beneath this checkout's outer jj workspace. Existing shared `gitCommonDir` resolution selected the outer object store, so navigator preparation returned 409 for tutorial commits. A separately registered Git clone under `/tmp` verified native source behavior. Nested Git inside an outer jj workspace remains a shared VCS limitation. The shipped tutorial still includes Code OSS keymap/language-service instructions; those steps are outside this native milestone.

The controlled VS Code executable verifies the real host invocation without launching a user's editor. Installed VS Code UI, native OS settings/edit menu clicks, OS system-theme switching, and production distribution were not manually exercised. Their covered boundaries and development-only scope should not be interpreted as complete desktop parity.

## Verification

Development build: `pnpm electrobun:build` with Node 24 on PATH and Hutch available. The legacy aggregate typecheck excludes this opt-in app because its generated Hutch SDK requires the native toolchain. Run `pnpm --filter @dev.fast/review-electrobun typecheck` after Hutch prepare/build. Scoped host/protocol/canvas checks and current Code OSS typecheck are recorded in the execution ledger; final results are added after completion review.

Run: `pnpm electrobun:dev` with Node 24 and Hutch on PATH. The default profile is `~/.dev-fast/review-electrobun`; existing desktop defaults remain unchanged. Packaging/signing, updates, CLI shim installation, Ask configuration, extension/keymap settings, and multiple windows remain deferred.

Final clean bundle launched with authenticated health 200, matching instance identity and desktop attachment. OS Quit exercised the native gate: the first AppleEvent was canceled while cleanup ran, then the app exited 0 and removed its discovery. Pre-review checks: 27 host tests, 65 protocol tests, and 12 shell/browser tests passed; app main/renderer, protocol and canvas types passed; scoped lint reported zero warnings/errors and formatting/diff checks passed. Existing desktop typecheck and overlay checks also passed during compatibility validation.


## Completion review

A fresh reviewer audited the whole implementation from `83a228cd` through `9e10141b`. All three Important findings were reproduced and fixed in one pass:

- External anchors route through native RPC. The SDK's scoped new-window event also routes Cmd/Ctrl-click through the same validated URL policy. Internal anchors remain local and privileged-view/JavaScript URLs are rejected.
- Full-snapshot `origin.tutorial` metadata distinguishes managed hidden tutorials from deleted reviews. Saved tutorial tabs restore, incoming tutorials survive catalog refresh, and missing reviews are dropped.
- A live sidecar's transient control/health failure displays reconnect status, disables dependent UI and closes transient menus/dialogs. Abortable retries validate health identity before reattaching and restore agent-open delivery.

Each finding has a failing regression followed by a passing run. Whole affected suites now pass: **28 host + 65 protocol + 16 browser = 109 tests**. App main/renderer, shared protocol/canvas and legacy desktop typechecks pass. Native acceptance additionally confirms ordinary, modified-click and mail links reach a controlled native opener with the exact URLs; the real hidden tutorial remains active after quit/restart with no alerts. The installed external browser/editor UI remains outside this controlled acceptance.

One minor remains deferred: the shared tutorial's optional Code OSS keymap/language-service lessons need copy adaptation for the native host. The other development-scope and OS-validation limits above remain explicit.
