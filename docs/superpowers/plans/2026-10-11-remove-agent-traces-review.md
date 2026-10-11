# Removal Plan Review

Reviewed [frozen draft v1](/tmp/whiteboard-remove-agent-traces-plan-v1.md) against the amended design. The [promoted implementation plan](2026-10-11-remove-agent-traces.md) incorporates the fixes below. This is a planning review; product changes and tests have not been executed.

## Senior Review

**Altitude diagnosis:** mixed. Scope, utility extraction and sharing rejection were concrete; stored reads, legacy evaluation and cleanup failure transitions required stronger decisions.

### Blockers

- **B1: Stored reads bypass document schemas.** `packages/review/src/review-api/store.ts:828` parses JSON and casts migrated blocks, including a separate live-snapshot return at line 855. Schema removal alone would still expose quotes. **Fixed:** explicit retired-content/document/reference gates for current, historical and live snapshots; direct read tests.
- **B2: A throwing legacy component can disappear silently.** `packages/review/src/publishing/review-publish-element-audit.ts:372` catches component expansion errors; line 125 also permits undefined element types. Existing aliases use `components.TraceQuote` in `review-publish-evaluate.test.ts:391`. **Fixed:** import-only sentinel recognition on both named exports and component lookup, fatal diagnostic propagation outside swallowed expansion, and nested/alias/JSX/createElement tests.
- **B3: Separate removal commits would leave broken callers.** `packages/review/src/review-api/http.ts:76` imports a module the draft deleted earlier; `sharing/import.ts:40` imports the deleted trace schema. UI callers also depend on removed protocol members. **Fixed:** one atomic document/backend/protocol/UI integration task, deleting modules after callers, with a combined green/typecheck gate and commit.
- **B4: One unsupported legacy review could block the entire profile.** `packages/review/src/review-import/json-cutover.ts:207` classifies all import failures as errors; line 289 makes them fatal. `review-api/profile.ts:28` awaits cutover before opening the profile. **Fixed:** a typed retired-content classification reports/skips that review while preserving originals; genuine malformed supported content still fails. Mixed-profile coverage includes healthy reviews and Ask history.

### Major

- **M1: Partial cleanup could destroy retry evidence.** `packages/review/src/cli/cli-install.ts:849` removes legacy launchers, while line 236 clears installer errors on success. **Fixed:** incomplete cleanup returns failure before ownership-bearing stamps/launchers change; apply and uninstall retry tests preserve that evidence.
- **M2: Desktop setup could reinstall capture after cleanup.** `packages/review/src/cli/cli-install.ts:322` configures capture and line 355 installs harness hooks independently of repository refresh. **Fixed:** remove all capture configuration/install/disable branches during retirement integration; obsolete requests reject without profile mutation.
- **M3: Launcher ownership does not prove ownership of an unmarked agent entry.** Historical Claude entries have no per-entry installation marker (`packages/trace-core/src/agent-trace-hooks.ts:364`, line 400). **Fixed:** remove only entries with verifiable management provenance and matching owned commands. Preserve ambiguous same-command entries with a diagnostic. This means some old unmarked agent entries can remain; guessing their ownership would violate the design's preservation rule.

### Minor

- **m1: Completion depends on configuration scope.** OpenCode paths use XDG_CONFIG_HOME independently of profile paths (`packages/trace-core/src/agent-trace-hooks.ts:55`). **Fixed:** marker matching includes normalized home/config scope and command set.
- Named exact instruction/tutorial paths and a concrete local tarball smoke command; corrected the nonexistent store-test path to a new behavioral `store-read.test.ts`.

### What the draft got right

- The user's latest scope removes quote conversion and legacy shared-trace decoders while preserving saved bytes and supported reviews.
- Strict share metadata rejection can happen before downloads using `packages/review/src/sharing/client.ts:41` and the cached parser at `sharing/import.ts:753`.
- Atomic-write/locking relocation preserves existing semantics and meaningful tests; account login preserves the profile credential location and wire client ID.
- Bun preflight, isolated cleanup fixtures, source/digest/pin validation, release repair and a checked diagram replacement remain required.

## Promoted Plan

The rewritten plan has five milestones: retained utilities/account login; ownership-safe hook retirement; atomic document/backend/UI removal; package/build deletion; final verification and diagram replacement. Old trace reviews are unsupported, with explicit per-review rejection or reported legacy-cutover skipping. No stored data purge or remote storage operation is included.

The hardest irreversible step is deleting verified managed hook files. Preserve predecessor configuration and unknown files, record failures, and stop before removing retry evidence. Reverting product commits restores code but does not automatically reinstall retired hooks. Supported review bytes and credentials remain intact throughout.

## Research Basis

Primary sources fetched on 2026-10-11 support existing contracts; no new framework or dependency is proposed:

- [Git githooks manual](https://git-scm.com/docs/githooks), updated for Git 2.54.0 on 2026-04-20: hooksPath, worktree/environment rules, hook arguments and stdin underpin predecessor restoration tests.
- [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/), dated 2024-01-28: link/reference syntax and code literals support parsed Markdown validation.
- [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628.html), August 2019: preserve device polling, pending/expiry behavior and the five-second slow_down increment.

## Delta and Open Questions

The rewrite adds stored-read guards and classified profile-safe rejection, combines coupled feature deletion, makes cleanup failures preserve retry evidence, and narrows ownership/completion rules. The removal scope needs no additional product decision. Execution method remains the handoff choice required by writing-plans.
