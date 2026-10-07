# GitLab integration implementation plan

Spec: [SPEC.md](../../SPEC.md). Execute in this session, one task at a time.

Keep the prototype on `prototype/gitlab-discussions`. Production work lives on
`feat/gitlab-integration`; use existing review storage, APIs, panel frame, and StyleX.

1. Add `packages/review-protocol/src/gitlab.ts` for validated identity, positions,
   discussions, drafts, and transport schemas. Add backend URL parsing, authenticated
   glab transport, paginated discussion import, and conservative line mapping in
   `packages/review/src/review-api/gitlab.ts`. Test invalid URLs, host isolation,
   system filtering, ambiguous mapping, and remote errors before implementing.
2. Add `gitlab-state.ts` using ReviewStore's SQLite connection. Implement revisioned
   draft saves and persisted sending/confirmed/failed/uncertain outcomes. Add the
   managed-clone/service module; extend `store.ts`, `local-data.ts`, `http.ts`, and
   `authoring-tools.ts` for MCP creation and explicit UI operations. Test with real
   scratch Git repositories and durable databases; fake only the GitLab boundary.
   Exercise deduplication, partial posting, interrupted posting, save conflicts,
   cache reacquisition, dirty/committed checkout refusal, and reply retention.
3. Add a GitLab context/panel next to existing review panels. Extend session metadata
   in `api-canvas.tsx`; integrate panel controls in `App.tsx`, manual inline drafting
   in the existing selection toolbar, and mapped markers/navigation in
   `PierreDiffView.tsx`. Use optimistic save revisions and a serialized save queue;
   show unsaved failures and flush before posting. Add behavioral UI tests.
4. Run targeted Vitest lanes, typechecks, lint/format, desktop build, then repository
   tests. Fix failures at their cause. Verify the actual production UI against a
   fixture transport in the collaborative browser. Report live GitLab validation
   separately; this environment currently has no glab executable.

The uncertain-post UI requires explicit user verification before another attempt.
Content matching cannot establish that an earlier request created a specific note.
Remote payloads and subprocess errors must be validated/redacted at the boundary.

## Using the implementation

Create a review through MCP `review_create` with `mergeRequestUrl` and an optional
`title`. The app needs `glab` on its PATH, authenticated for the MR host, plus Git
credentials that can clone the project. The configured glab Git protocol selects
SSH or HTTPS. Set `BLACKBOARD_GITLAB_CLONES_DIR` before starting the host to choose
where new MR clones go; existing reviews retain their registered checkout paths.

Open **Discussions** on the right of the review toolbar. The panel shows the account,
host, open threads, expandable resolved threads, and durable local drafts. Select
code and choose **GitLab comment** to draft inline. **Post** and **Post all** send
comments; **Resolve** preserves the reply draft. Refresh runs on opening and from
the panel button. It refuses local checkout changes and respects document leases.

An unconfirmed post stays locked until the reviewer checks the MR and explicitly
records whether it was posted. A process crash can leave a sibling `.lock`
directory for the managed clone; the error identifies it. Remove that directory
only after confirming the original operation has stopped, then verify any
unconfirmed post before retrying.

## Verification

Backend integration checks use durable SQLite databases and real Git repositories;
only the external GitLab boundary is faked. They cover MR identity reuse, draft
revisions, partial posting, unconfirmed writes, resolution retention, conservative
range mapping, stale-position refusal, checkout safety, and cache reacquisition
across a clone-root configuration change.

The production UI was exercised through the collaborative browser against the
real review API with a local GitLab fixture: reply drafting, inline selection,
posting, resolution, uncertain-post recovery, reopening, and the narrow-layout
bottom sheet. Browser regression tests also check that resolution updates code
markers and keeps the reply, and that failed autosaves block posting while
preserving editor text. Historical views disable draft actions.

The backend suite has 1,159 passing tests and one skipped test. The canvas suites
have 293 Node tests and 378 browser tests. Workspace typechecks, formatting, and
the desktop build pass with the required Bun 1.4.2. This machine's installed Bun
is 1.2.15; verification used a temporary binary without changing the installation.

Repository-wide lint has 141 existing errors in nine unchanged files; all files
changed for this integration pass lint. The full workspace test run encountered
a stale cached backend module while a new regression was being added; that lane
was rerun against the final source. The other workspace packages passed, including
30 desktop-shell tests.

Live GitLab authentication, private cloning, server permissions, and accepted
inline payloads remain unverified: `glab` is absent here, and no live comments were
posted. Check those with the intended GitLab host and account before relying on
this integration for a real review.
