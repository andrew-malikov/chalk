# Remove agent traces from Blackboard

## Intent

The user wants agent traces removed completely because the feature is unnecessary.
Blackboard should retain its canvas, source navigation, semantic diffs, Ask
conversations, and review sharing without recording, publishing, discovering, or
browsing coding-agent session transcripts.

This document defines the removal scope. It does not authorize deleting user
transcripts, remote objects, saved reviews, or Git history.

## Selected approach

Remove the trace feature across the desktop, CLI, agent API, document format,
storage integration, tutorial, and build graph. Move the small shared utilities
and sharing authentication currently housed in trace packages into existing
review modules. Delete the trace packages after all consumers have moved.

Two smaller alternatives were considered: hide the Trace view, or disable capture
while retaining playback. Both leave substantial trace functionality and
dependencies, so neither meets the request.

## Product and API changes

- Remove the Trace view, trace navigation actions, trace settings, capture status,
  storage configuration, session queries, trace playback, and quote interactions.
- Remove agent trace endpoints, trace uploads, the trace instruction topic, and
  trace guidance from the MCP/CLI tool catalog and authoring instructions.
- Remove capture, lookup, sync, and storage commands under `blackboard trace`.
  Sharing keeps its required login, logout, and account commands; those commands
  no longer request trace authorization or offer trace options.
- Remove agent and Git hook installation and refresh. New installations never
  install trace hooks, create commit trailers, or publish transcripts.
- Remove trace examples and the trace tutorial section. Keep tutorial content
  about the canvas, diagrams, source references, diffs, and Ask.
- Update the architecture diagram after implementation to match the final code.

Ask conversation history is a separate feature: it stores questions and answers
inside Blackboard and supports reopening a conversation. It remains part of Ask.
Startup diagnostic spans and diagram drawing animations also remain; they do not
capture agent session transcripts.

## Retiring stored quotes

A current `trace_quote` block contains `text`, `traceId`, and `eventId`. For
example, the fixture at `packages/review/src/fixtures/blocks/trace_quote.json`
contains the text "queue the order" plus IDs pointing to a trace resource. The
snippet already belongs to the review document; its session link enables opening
the surrounding transcript.

Remove `trace_quote` from new authoring and from the normal renderer. At existing
document compatibility boundaries, convert old blocks to ordinary Markdown
quotes, preserving their text, nesting, order, and block IDs. Escape text so
literal content cannot introduce unintended Markdown links or embedded elements.
Inline `review-trace:` links become their visible text with no trace target.
Use the existing stored-document migration path, which runs for current and
historical SQLite snapshots, rather than rewriting or deleting saved history.

Legacy review imports perform the same conversion without locating, downloading,
or retaining a transcript. Saved and previously shared reviews with trace quotes
must open without trace storage or credentials. Shared import compatibility
continues to validate manifest integrity, object digests, source pins, and all
supported resource types before exposing a review; retired quotes are ordinary
unverified prose and are never represented as authenticated transcript evidence.
New share exports contain no trace resources or trace references.

Stored trace resource blobs and external transcripts are left in place but are
not read, displayed, synced, or exported. There is no new purge operation.

## Existing hook cleanup

Retain only the minimum upgrade cleanup needed to retire prior installations.
Adapt the existing ownership checks in `cli-install.ts`, `agent-trace-hooks.ts`,
and `trace-repository-hooks.ts` before deleting the capture modules.

Cleanup runs during the existing managed install/update flow. It removes only
Blackboard-owned lifecycle entries and repository hook wrappers for this
installation, restoring chained predecessor Git hooks. Entries owned by another
installation, handwritten hooks, and other agent configuration remain intact.
Cleanup is idempotent and records completion only after successful cleanup;
failures remain visible and retryable. Unknown ownership is preserved.

The normal CLI has no trace command surface after removal. Mixed-version
installations can keep their independently owned hooks until they upgrade.
Implementation must not run cleanup against the developer's actual home or
repositories; cleanup verification uses temporary profiles and repositories.

## Shared code and package removal

`@dev.fast/trace-core` also provides atomic writes, file locks, process identity,
profile paths, package-root discovery, error formatting, CLI output helpers, and
sharing login. Move the required implementations and their meaningful tests into
existing `packages/review/src` modules, retaining their behavior and error handling.
Keep the existing profile path and sharing credential location so an upgrade
does not lose saved reviews or sharing login.

Trim the hosted client to the account/device-login functionality actually needed
by sharing. Move necessary account contracts to the review/share protocols;
remove trace contracts and re-exports from the application protocols. Do not
introduce a replacement catch-all package or rename the trace subsystem wholesale.

Delete `packages/trace-core` and `packages/trace-protocol` once there are no active
imports. Update workspace dependencies, lockfile, bundler/test aliases, build
scripts, release workflows, and package manifests accordingly. Audit agent plugin
instructions and installer compatibility paths for remaining capture guidance.

## Acceptance and verification

1. A fresh desktop/profile exposes no trace view, settings, routes, tools,
   resource upload type, or CLI commands and installs no trace hooks.
2. Existing reviews and historical versions containing standalone or inline
   quotes preserve their visible text and document structure without requesting
   trace resources or accessing transcript locations.
3. Legacy and shared imports handle retired quotes while retaining supported
   format validation, source checks, and image/map resource integrity checks.
   New sharing exports contain no trace references or transcript blobs.
4. Managed upgrade cleanup removes owned hooks, restores chained Git hooks,
   preserves unrelated configuration, and behaves correctly on repeated runs
   and filesystem errors. Tests use isolated temporary directories.
5. Sharing login/export/import/revoke, canvas authoring, semantic diffs, source
   navigation, and Ask conversation persistence continue working.
6. No active code imports either deleted trace package. Remaining references
   are limited to narrowly scoped compatibility/cleanup code, tests of retired
   formats, and historical documentation.
7. Run affected protocol, migration, sharing, CLI/install, and canvas tests,
   followed by workspace typechecking, lint/format checks, and the desktop build.
   Use the project-required Bun version. Browser checks cover the changed view
   switcher/settings/tutorial and retained Ask/sharing interactions.

Tests cover observable behavior and data preservation; do not add tests that
merely assert source strings or the exact tool catalog. Remove obsolete
trace-only tests. Follow AGENTS.md if an existing change-detector test is found.

## Constraints

- Do not edit README.md without explicit permission, as required by AGENTS.md.
- Do not overwrite the existing GitLab-focused SPEC.md.
- Do not delete external session transcripts, remote trace objects, user profile
  data, or existing `Agent-Session` commit trailers.
- Keep source and shared-resource validation at trust boundaries.
- Keep unrelated work and the previously generated diagram artifact intact
  until a checked replacement diagram is available.

## Implementation handoff

After the user reviews this written design, create an implementation plan that
orders the shared-code extraction, compatibility handling, hook retirement,
feature deletion, dependency/build cleanup, and verification. Plan against the
actual connected modules; do not replace the removal with a feature flag.
