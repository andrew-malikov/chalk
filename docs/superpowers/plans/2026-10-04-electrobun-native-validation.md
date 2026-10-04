# Electrobun native validation

## Rendering probe — 2026-10-04

macOS arm64; Electrobun 2.0.2; Hutch 0.27.1; Cottontail 0.7.1; Node sidecar 24.21.0. Used the platform WKWebView, without CEF or a Code OSS build.

A temporary fixture supplied nonempty before/after TypeScript and a modified-file manifest to the actual Pierre inline factory. A flow diagram used the bundled libavoid application URL. A real Node child exposed authenticated loopback HTTP and a streaming response. The probe used the native SDK RPC, then quit through before-quit cancellation, child shutdown, and an explicit quit retry. The fixture and diagnostic preload were removed after this probe.

Observed: six rendered code rows; one search match; two CSS Highlight entries; one SVG routed edge; no reported renderer alerts. Authenticated fetch returned `{ok:true}`; streaming returned `first\n`, followed by cancellation. WASM loaded from `views://mainview/assets/libavoid-BRQRZjmQ.wasm`. Native shutdown reported child exit 0. Canvas font resolved to Geist Mono.

SDK preparation exports the browser entry as `electrobun/view`; use that generated export rather than the documentation’s `electrobun/browser`. Direct fixture-style `new URL` asset resolution is required for the unexported libavoid WASM subpath.

Temporary raw diagnostics remain in the ignored execution scratch. This establishes the renderer/build seam; it does not establish complete application behavior.

## Application acceptance

Pending implementation and native smoke of Home, real reviews, source navigation, tab/settings restoration, and failure/shutdown cases.
