# Electrobun desktop: first working review

Date: 2026-10-04
Status: Design for review; implementation has not started.

## Outcome and scope

Start a desktop application in `apps/review-electrobun` that runs without Code OSS or Electron. Reuse the existing React canvas, Pierre renderers, diagram components, review protocol, and Node review server. The first milestone is a working development app on the current macOS machine: start it, open a review from Home or the authoring API, read its document and diffs, navigate diagrams, and open pinned source in external VS Code.

The user approved pursuing a replacement shell and reusing the application infrastructure. This document makes the first milestone concrete. Production distribution and switching the default desktop app follow after the working app has been validated.

## Approach

Use one Electrobun window and one webview containing our own shell and the existing React canvas. Pin Electrobun `2.0.2` through Hutch. Use its default Cottontail main process and the platform webview, initially WKWebView on macOS. Keep the existing server in a separate Node 24 process.

This isolates the shell change from runtime compatibility work: the server uses `node:sqlite`, and its database and tool execution behavior should continue running on Node. Hosting the server directly in Cottontail or Bun would require a separate compatibility investigation. Carving an application shell out of the existing Code OSS fork would retain the dependencies we are trying to retire.

CEF is outside the initial configuration. If the platform webview fails a required rendering behavior, record that concrete failure before deciding whether to fix the frontend or change the renderer. No performance or size improvement is claimed before measurement.

## Application ownership

| Component | Responsibility |
| --- | --- |
| Electrobun main process | Window lifecycle, Node server lifecycle, persisted shell preferences, native application menu, external URL/source launching. |
| React shell | Home and review tabs, active tab, canvas mounting, menus/dialogs needed by existing review controls, keyboard shortcuts, notifications, and visible connection errors. |
| Existing canvas | Review document, Pierre diffs and peeks, diagrams, document find, progress, selection/copy, and existing review interaction logic. |
| Node sidecar | Review catalog and storage, authenticated HTTP APIs, authoring API and CLI relay, pinned source/workspace resolution, review updates, and tool execution. |

The application has no Monaco models, VS Code extension host, Code OSS editor groups, or Code OSS service imports. Source editing and semantic language navigation remain in external VS Code. Pierre uses Shiki for highlighting; diagrams consume review data and use the existing React/SVG/WASM renderers.

## Startup, instance isolation, and shutdown

The launcher builds the shared server and frontend, prepares the pinned Electrobun SDK, and starts the new app. Add explicit `electrobun:dev` and `electrobun:build` workspace commands. Development requires Node 24; missing or incompatible tooling must produce an actionable error.

The main process starts `packages/review/dist/server/desktop-host.js`, using the existing desktop-host environment contract, with port `0`, a launch token and instance ID, the actual app PID, and a separate dev instance key. Derive the key from the checkout and distinguish it from the existing desktop's key. Use a dedicated Electrobun data directory by default; honor an explicitly supplied `DEV_REVIEW_HOME`. Print the non-secret profile and instance selection needed to target the app from the existing CLI.

The existing `reviewInstanceIdentity` derives its dev key only from the checkout. Add an optional validated dev instance-key override to that host contract so the two shells can be distinguished without inventing a different checkout path. With the override absent, preserve existing identity behavior.

Wait for the server's newline-delimited `ready` event and validate its discovery record before giving the connection to the renderer. Surface migration messages and startup errors. The new instance must not overwrite the stable or existing checkout instance's discovery record, switch the machine's default instance, or open the existing application's writable profile by default.

Shutdown closes control/catalog streams, asks the server to exit through its existing signal/shutdown contract, waits for it, and terminates the child if it fails to stop within the shutdown deadline. A server crash leaves a visible disconnected state; it must not keep stale authenticated UI controls appearing usable. Automatic restart is outside this milestone.

## Bridge and data flow

Serve the built frontend as bundled application content. Use Electrobun's typed RPC only for bootstrap and native operations. Restrict privileged views to application content; open external links through the host rather than navigating the privileged webview. Validate privileged RPC payloads at the host boundary.

The browser adapter implements the existing `ReviewCanvasBridge`. For review data it uses direct `fetch` with `x-review-token` against the sidecar's loopback origin. The server already handles CORS, this header, and streaming responses. Retain response status/body/headers and cancellation; do not serialize all data through RPC or buffer server event streams. Resolve request URLs against the known server and refuse forwarding the token to a different origin.

Subscribe to the authenticated `/control` stream and answer `/control/result` using the existing verb protocol. Opening a review through the authoring API selects or creates its tab and brings the application forward. Return existing capability responses truthfully. Subscribe to catalog/review events using existing endpoints, and dispose streams and subscriptions with their owning app or review session.

Create API canvas content from the selected review and the connection. Reuse existing canvas request, post, and surface-event semantics. Route review/document/diff navigation within the canvas; route source and range opening through the server's pinned navigator workspace and then host-side VS Code argument-vector launching. Preserve each reference's own pins, side, and source coordinates. A failed external launch reports an error.

Keep `ReviewCanvasBridge` transport-independent. Trace remaining consumers of its required `inlineEditors` property and remove that legacy requirement from shared React/protocol code if it has no active consumer; do not supply a fake native editor implementation. Keep the current desktop compiling through any shared interface changes.

## Shell and preferences

Provide Home, review tabs, a visible active tab, closing tabs, and keyboard tab navigation. Use one canvas instance per open tab, retaining its local navigation state while inactive; dispose it when the tab closes. Keep existing document, Diff, and comparison surfaces inside that canvas. Persist open review IDs and the active tab, restoring only reviews still in the catalog.

Provide the existing canvas UI adapter for menus and destructive-action confirmation, including keyboard focus, Escape dismissal, and returning focus to the trigger. Reuse frontend controls where available. Wire document find to `ReviewCanvasHandle.showFind` with Cmd/Ctrl+F. Home opens a review from the catalog and can prepare/open the existing tutorial against the new instance.

Persist light/dark/system theme choice and split/unified diff layout through the new host's own preferences. Follow system appearance when selected. Supply theme explicitly to non-review canvas pages so they do not require `.monaco-workbench` or its CSS variables. Preserve the existing host behavior while introducing that shared mounting seam. Serve bundled libavoid WASM and font assets through application URLs.

For this milestone, settings cover theme and diff layout. VS Code extension/keymap installation, the existing extension settings UI, automatic CLI shim installation, Ask configuration UI, telemetry/crash-reporting parity, multiwindow behavior, release signing, updates, and production CI are subsequent migration work. Shared review/server features remain available through their existing APIs; do not claim UI parity for controls that are not wired.

## Validation and acceptance

Use behavior checks at the host boundary and existing canvas behavior coverage. Do not add source-shape, import-list, DOM-structure, or other change-detector tests.

1. Build/typecheck the new host and frontend with no Code OSS build prerequisite. Check affected shared packages and the current desktop when shared contracts change.
2. Start the native macOS development app using the system webview. Record the actual renderer and runtime versions. Open the tutorial and a real review, both from Home and through the existing authoring/CLI relay.
3. Exercise the document, main diff and commit comparison, Pierre peeks, original source line numbers, pinned/renamed source launching, search and highlights, copy/selection, progress, and split/unified layout. Verify that peeks do not instantiate Monaco.
4. Exercise sequence/flow diagrams, software maps and their libavoid WASM routing, call trees, and math. Confirm styles/fonts render in the webview, including CSS scope and search-highlight support.
5. Change theme/layout, switch and close tabs, restart the app, and confirm preferences/tab restoration. Check menus/dialogs and keyboard focus.
6. Verify unknown-origin requests cannot receive the review token, malformed native requests fail, cancellation disposes a stream, and VS Code launch failures surface an error.
7. Quit the app and confirm the child server and discovery record are gone. Kill the child separately and confirm the shell reports disconnection. Run the old and new app together with distinct profiles/instances.

The milestone is complete only with a real native-app smoke result. A passing browser fixture or successful compilation alone does not establish Electrobun compatibility. No Code OSS deletion or replacement of default launch commands belongs to this milestone.

## Research and existing seams

- [Framework research](../../research/electrobun.md) establishes Electrobun 2.0.2, Hutch, Cottontail, optional CEF, and the Node SQLite compatibility question. Its earlier description of native peeks is superseded by the current Pierre implementation.
- [Desktop host](../../../packages/review/src/server/desktop-host.ts), [control relay](../../../packages/review/src/server/review-server-core.ts), and [HTTP/authentication](../../../packages/review/src/server/hono-http.ts) supply the server contracts.
- [Canvas contracts](../../../packages/review-protocol/src/contracts.ts), [mounting entry](../../../packages/review/app/src/desktop-entry.tsx), and [browser fixture bridge](../../../packages/review/app/src/fixture-review-bridge.ts) supply the frontend seams.
- [Official tagged configuration](https://github.com/blackboardsh/electrobun/blob/v2.0.2/docs/src/content/docs/electrobun/apis/cli/build-configuration.mdx) and [SDK/package-manager ownership](https://github.com/blackboardsh/electrobun/blob/v2.0.2/docs/src/content/docs/electrobun/guides/project-ownership.mdx): pin the SDK in Hutch, keep pnpm as package manager, prepare `.hutch/devkit`, and use the SDK's Vite aliases. The npm `electrobun` package is a bootstrap launcher, not the application SDK.
