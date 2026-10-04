# Pierre diff viewer port

Status: implemented and verified on `codex/pierre-diffs-port`.

## Goal and scope

Replace Monaco in the Diff tab and commit comparisons with `@pierre/diffs`, using the existing React canvas. Make diff rendering independent of Code OSS so a later desktop-shell replacement can reuse it.

The user permits expensive feature parity to be deferred to `LOG.md`. The first slice uses conventional textual diffs. Document code peeks keep their Monaco renderer, sizing, search, and language services, but use textual comparison and progress during this slice. Source editing and the desktop shell remain on Code OSS. A second slice can move document peeks onto the same renderer after the first slice works.

## Pre-port baseline

- `packages/review/app/src/DiffView.tsx` renders the lens/sidebar UI, then calls `bridge.diffView.create()` to mount a native widget.
- `packages/review/app/src/DocumentCodeView.tsx` calls `bridge.inlineEditors`; these previews share the native diff controller.
- `apps/review-desktop/code-oss/src/vs/review/services/reviewApiSourceService.ts` resolves pinned comparisons, changed-file lists, source model URIs, and streams.
- `reviewDiffViewService.ts` owns comparison sessions, lens projection, document search, selection adoption, and restoration.
- `reviewFilesDiffView.ts` wraps Code OSS multi-diff, file-tree, and editor APIs. `reviewStructuralDiff.ts` translates diffr alignment/highlights/folds into customized Monaco providers.
- `packages/review/app/src/review-lenses.tsx` and the server already support `structural` and `textual` progress modes.
- The existing `GET /reviews-api/:id/diff?format=patch` produces numbered, budgeted patches for agent consumption. Pierre needs an actual unified patch.

## Decisions

### Render in React

Use the published `@pierre/diffs@1.5.1` React `CodeView` for the multi-file viewport. It accepts parsed `FileDiffMetadata`, virtualizes files and rows, exposes item/line scroll targets, and reports selection and scroll changes. Keep binary/empty/error/loading file entries in app-owned UI rather than inventing text diffs for them.

Put renderer code under `packages/review/app/src/diff/`. Do not add a new workspace package, a renderer factory, or a generic editor abstraction. The host provides requests, source opening, settings, and selection delivery; it does not create or control the new diff DOM.

Retain the current bridge layout setting for now: `split`/`unified` maps directly to Pierre's `diffStyle`. This preserves the saved preference while avoiding a settings migration in this port.

### Preserve authoritative textual changes

Add `format=raw` to the existing diff route and query schema. Require a single `file` in raw mode and reject combination with `paths`. Read the unnumbered patch through the existing `LocalReviewData.changes(pins, file)` path. Preserve both paths of a rename in the underlying Git request.

Keep `format=patch` and its agent-facing numbering unchanged. For raw mode, apply the existing request byte budget as a limit: return an explicit oversized-file error instead of truncating a syntactically valid patch into misleading partial content. The viewer requests the current maximum of 500,000 bytes per file, rather than inheriting the 40,000-byte default. Larger patches get a file notice with source-opening access; raising this limit or implementing chunked rendering is deferred in `LOG.md`.

Load `/diff?format=files` once per comparison. Load the initial or explicitly revealed file first, then progressively fetch the remaining patches with two requests in flight. Parse them with Pierre's `parsePatchFiles` and insert materialized items in stable manifest order, preserving the viewport anchor. The tree lists all files immediately and shows a requested file's loading/error state. Pierre requires parsed metadata before an item can occupy its viewport; do not fabricate placeholder hunks or add a second virtualizer. Its virtualization bounds mounted rows and highlighting, while parsed metadata grows with the accepted patches.

For committed comparisons, full source bytes come from the existing `/file` route when context expansion needs them. Added/deleted files have a missing side, not an invented empty source file. Handle pure renames, mode-only changes, binary files, and identical context files explicitly.

Use the existing `reviewSourceComparison`, `reviewSourceQuery`, and source-pin contracts. A comparison identity includes review/version, commit or explicit pins, and worktree generation. Cancel obsolete loads and ignore their results. Cache by that identity and path, shared by mounted full/lens views; use the server's authenticated requests for file access.

Worktree generation is a client invalidation label, not an immutable source snapshot: the server independently reads current checkout bytes for patches and `/file`. In v1, display live patches and refresh on generation changes, but disable full-source hydration/context expansion for worktree patches. Do not combine a previously parsed patch with later worktree bytes. An atomic live comparison transport is separate deferred work.

### Use textual progress consistently

The new viewer, native document peeks, file counts, lenses, viewed actions, catalog totals for this review mode, and copy/ask context must use the existing textual mode. Use one effective textual mode throughout the shared canvas; retain the persisted structural preference for future restoration. Pass an explicit effective rendering mode to the canvas's native peek service so it also uses ordinary textual comparisons. Do not retain structural rendering with textual changed/viewed overlays.

Do not mutate the user's structural preference as a side effect of opening Pierre. Do not mix structural remaining counts or fold exclusions with textual hunks. Audit mode propagation in `api-canvas.tsx`, `App.tsx` authoring target kinds, navigation restoration, native peek setup, live subscriptions, progress requests/mutations, and context requests before cutover. Settings should make the currently available textual rendering clear while preserving the saved preference.

### Keep useful review interactions

- Split/unified layout, theme, fonts, wrapping, and keyboard-accessible file navigation.
- Changed-file tree, file headers, file reveal, and commit-scoped comparisons.
- File/lens viewed actions retain their authored source-range semantics.
- Basic lenses filter to matching files and reveal the selected source range with ordinary textual context. The UI must make the whole-file display clear; precise range masking is deferred.
- Line selection supplies the existing review selection payload, including pinned identity, side, source lines, and `selectedDiff`. Derive excerpts from the parsed patch, including both sides of an intersected replacement. Deliver selection directly from the canvas through a narrow bridge callback; do not register fake Monaco editors.
- Copy/Ask and opening a selected source range in the existing source editor remain available.
- Restore scroll and file collapse per comparison/lens/layout. Use source anchors and stable file IDs, with pixel offset within the anchor, rather than serialized Monaco widget state. Start a new storage namespace; old native state can remain for native peeks.

Native document peeks continue to provide their current search and language interactions in this first slice, using textual diff rendering. Structural display features deferred from the review canvas are listed in `LOG.md`.

## Compatibility gate

Code OSS's workbench HTML requires Trusted Types and allowlists policy names. Pierre 1.5.1 writes strings to `innerHTML` inside its shadow root. This is a concrete integration blocker to resolve before broad migration.

Prove the renderer in the real Electron workbench with the existing CSP enabled. Prefer a scoped dependency patch, following the repo's existing dependency-hardening approach, that routes Pierre's own generated HTML through a named Trusted Types policy. Add only that policy to the allowlist. Never introduce a global default policy or relax `require-trusted-types-for`.

Check all Pierre HTML sinks used by the chosen viewer, headers, and SVG sprite; source text must remain escaped. Verify Shiki's selected engine, bundled language/theme imports, and worker asset URLs under `vscode-file:` and offline. Start with Pierre's JavaScript highlighter; add a bounded shared worker pool when the large-review check demonstrates it is needed. The worker pool highlights; raw patch loading remains separately lazy.

Pierre's CSS lives in shadow DOM. Explicitly map app colors and typography through its supported theme/CSS hooks; the canvas's global scoped CSS cannot style its internals. Check light, dark, high contrast, focus visibility, selection, and narrow panes.

If a small scoped compatibility patch cannot make this work, stop the implementation at the gate and revise the hosting approach. Do not accidentally turn this slice into a custom renderer or Code OSS rewrite.

## Implementation milestones

### 1. Prove one diff in the desktop renderer

- [x] Add the pinned dependency to `packages/review/app/package.json`.
- [x] Build a disposable proof using `CodeView`, a real parsed patch, app theme, selection, and the desktop CSP. Keep it behind a development-only entry until the gate passes.
- [x] Resolve Trusted Types using a narrow dependency patch/build integration, updating `packages/review/app/desktop.vite.config.ts` and the workbench policy allowlist only as needed.
- [x] Check offline highlighting, resize, a large-file viewport, and progressive insertion of several files without shifting the reading anchor; decide whether the shared worker pool is necessary from this result.

Done when the real desktop renderer displays and interacts with the diff under its existing security policy. A normal browser-only proof is insufficient.

### 2. Load pinned textual comparisons

- [x] Extend `packages/review/src/review-api/read-schemas.ts` and `http.ts` with the raw single-file format; reuse `LocalReviewData.changes`.
- [x] Add `packages/review/app/src/diff/pierre-comparison.ts` for changed-file/patch/source loading through `ReviewSession`, parsing, cache identity, cancellation, and per-file outcomes.
- [x] Consume existing source-query helpers and authenticated requests. No new filesystem transport or Monaco model URI dependency.
- [x] Add behavior tests for raw output parsing, rename paths, added/deleted sides, the explicit 500,000-byte request/over-limit outcome, stale worktree results, and cancellation. Preserve the existing numbered patch behavior. Verify committed-source expansion and disabled worktree hydration separately.

Done when pinned, commit-scoped, and worktree comparisons produce the right files and source line numbers without creating Monaco models.

### 3. Replace the Diff tab and commit viewer

- [x] Add `packages/review/app/src/diff/PierreDiffView.tsx` with an app-owned changed-files tree; reuse existing pure ordering helpers.
- [x] Replace `NativeDiffView` in `DiffView.tsx`; update the commit comparison caller through the same component.
- [x] Preserve layout controls, file navigation, viewed actions, binary notices, loading/error states, and basic whole-file lens filtering/reveal.
- [x] Keep anchor-based restoration and per-file collapse in `PierreDiffView.tsx`. Restore after loading/measurement without pulling the viewport back after the reader scrolls.
- [x] Switch the shared canvas and its progress/context data to textual mode through `api-canvas.tsx`, `App.tsx`, `review-lenses.tsx`, navigation restoration, and relevant request callers. Pass the effective textual rendering mode to native peek setup in `reviewApiSourceService.ts`/`reviewDiffViewService.ts`; verify `DocumentCodeView.tsx` receives matching changed/viewed ranges. Do not overwrite the structural preference.
- [x] Connect Pierre selection to Copy/Ask and source opening. Extend `packages/review-protocol/src/contracts.ts` only for capabilities that the current canvas/host seam lacks; sync the fork's generated protocol copy with `pnpm --filter @dev.fast/review-desktop protocol:sync`.
- [x] Add browser behavior checks for reveal before loading, split/unified selections, replacements, renamed/deleted files, lens viewed scope, mode-consistent counts, and scroll restoration after live updates.

Done when review and commit diff surfaces operate on Pierre, including navigation and authoring selections, while document peeks still work on their native path.

### 4. Remove obsolete wiring and validate the cutover

- [x] Remove the bridge DOM-mounting path and native Diff-tab wiring no longer used. Retain `ReviewDiffViewService`, `ReviewFilesDiffView`, and structural providers while document peeks still depend on them; do not claim those modules can yet be deleted wholesale.
- [x] Remove development proof scaffolding. Record any additional observed regressions in `LOG.md` with concrete restoration criteria.
- [x] Run the canvas typecheck/build and affected Node/browser tests; run the desktop build and affected protocol/host tests if their code changed. Use the existing project test scripts.
- [x] Verify production assets under enforced desktop CSP, offline local rendering, both native themes, native peeks/source opening, commit comparison, keyboard navigation, narrow layout, wrapping, a large review, and live worktree patch replacement. Unit/browser tests cover cancellation and reading restoration. A release-packaged executable is not part of this validation run.

Done when the new diff surfaces need no Monaco diff models/widgets and the remaining Code OSS diff dependencies are attributable to documented native peeks.

## Verification principles

Test user-observable behavior, data identity, and loading failures. Do not add source-string assertions, DOM-structure snapshots, or tests that merely restate component implementation. Follow the repository's prohibition on change-detector tests.

Record initial render time, responsiveness while scrolling, mounted/rendered row counts, accepted/rejected patch bytes, and peak memory on the same large-review fixture before and after. Measure progressive loading and virtualization separately; metadata is proportional to accepted patches. Include oversized rejected files in the report so omissions cannot masquerade as a performance improvement; use the measurements to decide on workers and tuning rather than making up a performance target.

Rollback is reverting the viewer cutover and its effective textual-mode wiring. Keep native code needed by peeks until they migrate; do not ship a permanent dual-renderer toggle unless the compatibility gate reveals a concrete need.

## Alternatives considered

1. Mount Pierre from the Code OSS service: fewer initial React changes, but retains host-owned DOM/factories and makes later shell removal harder.
2. Preserve all structural behavior now: requires representing arbitrary diffr correspondence, token spans, and asymmetric labeled folds in a conventional hunk renderer. Pierre's public metadata uses context/change blocks; its custom hunk-separator callback is already deprecated. This should be a separate feasibility task.
3. Recommended: move the primary textual diff surfaces into React now; keep native peeks temporarily and track parity work explicitly.

## Review corrections

The isolated senior review found four gaps in the initial draft, corrected above:

- Worktree generations do not freeze source bytes; live context hydration is deferred.
- Native peeks share progress with the Diff tab; both use an explicit effective textual mode.
- Pierre has no unloaded diff-item type; patch loading is progressive, while rendering is virtualized.
- The existing patch budget has a real ceiling; the viewer explicitly requests 500,000 bytes and records larger-file handling as deferred work.

## Sources checked on 2026-10-04

- Published [`@pierre/diffs` 1.5.1](https://registry.npmjs.org/@pierre/diffs/1.5.1): inspected the shipped React `CodeView`, `FileDiffMetadata`, hunk, selection, rendering, and worker APIs and HTML sinks.
- [Pierre's README](https://github.com/pierrecomputer/pierre/blob/main/packages/diffs/README.md) and [official documentation](https://diffs.com).
- Repository files cited above, especially the existing textual coverage path in `packages/review/src/review-api/comparison-coverage.ts` and workbench CSP in `apps/review-desktop/code-oss/src/vs/code/electron-browser/workbench/workbench.html`.

## Implementation and validation

The cutover uses `PierreDiffView.tsx`, `pierre-comparison.ts`, and `pierre-selection.ts`. It fetches two complete patches at a time, publishes immutable per-file outcomes, and uses Pierre's `CodeView` virtualization. Each view owns its metadata because Pierre mutates it during context hydration. Full-source hydration is limited to immutable comparisons. Raw patches are filtered to the exact manifest entry before the byte budget is checked, including deleted-file paths that have become directories.

Canvas and native typechecks passed. Production canvas/server builds and the native desktop build passed. The affected canvas suite passed 77 tests across 18 files; raw diff transport passed 9 tests; native source/selection/layout behavior passed 17 tests. Regression tests cover cancellation and partial failure, selected patch contents, selection scrolling, reading restoration, missing saved files, offscreen lens navigation, and deletion-to-directory path filtering. An Electron 43 Trusted Types gate rendered literal script text with zero script elements and no errors.

A single desktop run compared 160 files containing 48,000 source lines per side:

| Measurement                      |                          Monaco baseline |           Pierre |
| -------------------------------- | ---------------------------------------: | ---------------: |
| First visible diff rows          |                                 1,397 ms |           293 ms |
| All patches accepted             | Not measured; native sources load lazily |         6,599 ms |
| Retained JS heap after forced GC |                         97,533,620 bytes | 85,181,964 bytes |
| Mounted files                    |                                        1 |                1 |
| Mounted row markers              |                                       78 |               88 |

Pierre accepted 1,892,960 patch bytes with zero rejected files. Scrolling 3,600 pixels over 30 animation frames averaged 16.39 ms per frame, with a 21.90 ms maximum. These figures describe one local run, retained JS heap, and DOM row markers; peak process memory and a directly comparable native scroll benchmark were not measured. Metadata remains proportional to accepted patch bytes.

Desktop smoke passed using the staged production runtime and canvas in the native development shell: retained document peeks, keyboard file navigation, wrapping, a 650-pixel viewport, pinned source opening, scoped commit comparisons, Light/Dark theme updates, and live worktree patch replacement. External HTTPS requests were blocked during this run, and no renderer page errors were recorded. The review was reopened after source/settings navigation. Full release-package smoke and peak process-memory measurements remain outside this verification run.

Obsolete native mounting/disposal and factory/reveal call tests were deleted under `AGENTS.md`. The user approved relying on the new Pierre behavior tests rather than dedicated replacements.
