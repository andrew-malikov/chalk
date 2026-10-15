# Review navigation with XState

Status: proposed for review.

## Purpose and scope

Replace the review navigation and side-panel Zustand store with XState. Preserve
the behavior a reader sees, including restoring an existing review. This is the
first migration proposed in the conversation; the user approved starting it.

Migrate `review-panel-store.ts`, its React provider, its consumers, and the
navigation subscriptions in `review-view-state.ts`. Search, diagram navigation,
database use-case selection, desktop shell state, and GitLab posting retain their
current owners. The persisted view-state store and shared persistence middleware
also remain in place. Existing XState dependencies are sufficient.

## Approach

Use one XState machine per mounted review panel provider. Represent the active
view as four explicit machine states: `review`, `commits`, `diff`, and `map`.
Keep payloads in context: the current peek, panel motion, available views,
selected lens, commit diff scope, map focus request, and fullscreen tour.
Derive the current view from the machine state so there is one source of truth.

Consumers send typed events for the existing operations: show a view, open or
close a peek, suppress motion, select or clear a lens, open a commit diff, update
available views, request or consume map focus, and open, move, or close a tour.
The machine owns the coordinated changes each event makes.

Use `useActorRef` to bind actor lifetime to the provider and `useSelector` for
selected state. Imperative consumers use `send` and `getSnapshot`. Update callers
directly rather than introducing a store compatibility layer. Optional consumers
continue to work outside a panel provider. Each mounted review has its own actor;
unmounting one review must leave its siblings usable. React Strict Mode replay
must leave the mounted provider usable too.

Alternatives considered:

- Keep the store-shaped API over an actor. This reduces caller edits but adds a
  second interface and conceals event handling. Direct actor use is preferred.
- Migrate every store together. This combines navigation changes with search
  cancellation and persistence changes, making regressions harder to isolate.

## Behavior to preserve

- A request for an unavailable view falls back to `review`. Removing the current
  view from the available views does the same.
- Ordinary navigation to a view other than `review` closes a side peek. Selecting
  a lens keeps an existing peek open alongside its diff, retaining panel motion.
- Opening a commit diff sets its scope. Leaving the diff clears that scope;
  returning to the diff shows the whole review unless another scope is chosen.
- A selected lens clears commit scope. Lens restoration remains restricted to
  the saved version and diff mode.
- Map focus opens the available map and closes a peek. Consumption matches the
  request ID. Leaving Map clears a pending request without losing the focused
  element used to choose a model. A canvas without a map ignores focus requests.
- Tours retain their anchor and reveal counter. Switching tours requests a new
  reveal. Navigation to another view closes a tour, and restoration drops a tour
  over a view other than `review`. Preserve current tour-event behavior rather
  than adding new eligibility rules during this migration.
- Opening or closing a peek restores live motion. Resuming a cached canvas can
  suppress panel entrance motion.

## Persistence and scrolling

Keep storage keys, record versions, validation, legacy migrations, and saved
fields unchanged. Persist the existing resumable projection of the actor state;
do not store an XState snapshot or transient peek content.

Adapt navigation subscriptions to actor snapshots. XState subscribers receive
the current snapshot, so retain the previous relevant values locally when
deciding whether navigation changed. Establish the comparison baseline before
subscribing and avoid writing defaults on a fresh mount. Preserve subscriptions
early enough to capture host navigation immediately after mount.

Leave scroll restoration and capture logic intact except for reading the actor
and disposing its subscriptions. Preserve cancellation on view changes or user
input, waiting for growing content, and flushing the final scroll position.

## Change boundary

Production consumers include `App.tsx`, review components and context, lenses,
sequence/flow/database tours, call-tree peeks, tutorial tour detection, and the
GitLab panel coordination calls. Update their related types and imports. Retain
the existing navigation payload types where consumers already share them.

Tests using the old store API must send events and read snapshots instead.
Mounted-canvas and Gherkin tests should retain their behavior assertions. No
README changes or additional dependencies are required.

## Verification

Preserve the 11 navigation transition tests. Add focused behavioral coverage for
stale map-focus consumption if it is not already exercised. Exercise provider
cleanup, Strict Mode replay, and independent reviews through mounted tests.
Assertions should cover transitions and visible outcomes, avoiding source-text
checks and snapshots of the machine configuration.

Run the canvas node and browser suites, canvas typecheck, and acceptance tests.
The panel, restoration, lens, tour, tutorial, and GitLab integration tests cover
the main callers. Run lint and formatting checks on the changed files. Record
actual results and any unrelated failures before claiming completion.

The primary regression risks are persisting an initial fallback over a saved
choice, changing peek retention during lens selection, and retaining actor
subscriptions after cleanup.
