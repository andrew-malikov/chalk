# GitLab discussion and posting facts

Researched 2026-10-07 from current official GitLab documentation and first-party source. Scope: platform capabilities that inform a small MVP product outline; no implementation or account access.

## Findings

| Need | Documented API / constraint |
| --- | --- |
| Import conversations | `GET /projects/:id/merge_requests/:merge_request_iid/discussions` returns discussion IDs, `individual_note`, and nested notes including IDs, type, body, author, timestamps, system flag, resolution fields and diff positions. It lists all discussion items, not just unresolved ones. [Discussions API](https://docs.gitlab.com/api/discussions/#list-all-merge-request-discussion-items) |
| Reply | `POST /projects/:id/merge_requests/:merge_request_iid/discussions/:discussion_id/notes` with `body`; successful response is the created note, HTTP 201. It can turn a single comment into a thread. Replies use discussion identity, not a fresh line position. [Reply API](https://docs.gitlab.com/api/discussions/#add-note-to-a-merge-request-thread) |
| New general thread | `POST .../discussions` with `body` and no `position`; replies can subsequently be added. [Create discussion](https://docs.gitlab.com/api/discussions/#create-a-merge-request-thread) |
| General standalone comment | `POST .../notes`; explicitly not attached to code lines. The Notes API alone is insufficient for importing thread structure: GitLab documents that `DiscussionNote` items are not returned as part of that API. [Notes API](https://docs.gitlab.com/api/notes/#create-a-merge-request-note), [note types](https://docs.gitlab.com/api/discussions/#understand-note-types-in-the-api) |
| New inline thread | Same discussion-create endpoint, with `position` identifying the diff revision, file paths, side and line(s). HTTP 201 returns the created discussion. [Inline creation](https://docs.gitlab.com/api/discussions/#create-a-new-thread-in-the-merge-request-diff) |
| Resolution | Imported notes expose `resolvable`, `resolved`, `resolved_by`, `resolved_at`. Dedicated PUT endpoint resolves/reopens; docs require Developer/Maintainer/Owner or author of the change. Resolved threads remain commentable. Reading resolution status does not require implementing resolution actions. [API](https://docs.gitlab.com/api/discussions/#resolve-a-merge-request-thread), [user documentation](https://docs.gitlab.com/user/discussions/#resolve-a-thread) |

The discussion list includes system activity as well as user messages; deciding what the Chalk surface displays is a product decision. Pagination defaults to 20, maximum requested page size 100; importing only the first response would silently omit conversations. Follow pagination links; GitLab.com may omit some total-count headers. [Discussions pagination](https://docs.gitlab.com/api/discussions/#discussions-pagination), [REST pagination](https://docs.gitlab.com/api/rest/#pagination).

## Identity and inline anchors

The remote identity needs the GitLab instance, project ID or URL-encoded project path, project-scoped MR IID, discussion ID and individual note ID. IID is not the database-wide MR ID. This follows the documented endpoint parameters and response identities above.

A text inline position requires `base_sha`, `head_sha`, `start_sha`, `position_type=text`, **both** `old_path` and `new_path`, plus line coordinates. Added line: `new_line` only. Removed line: `old_line` only. Unchanged context line: both, which can differ. GitLab also supports multi-line ranges with start/end line codes and types, and image/file positions, but the decision to include these in the first outline remains open. [Position rules](https://docs.gitlab.com/api/discussions/#create-a-new-thread-in-the-merge-request-diff), [multiline parameters](https://docs.gitlab.com/api/discussions/#parameters-for-multiline-comments).

GitLab instructs clients to fetch MR `/versions` and use the latest entry's `base_commit_sha`, `head_commit_sha`, `start_commit_sha`. These respectively mean merge-base, source HEAD, and target HEAD when that diff version was created. A specific historical version is available at `/versions/:version_id`. These are remote diff anchors, not arbitrary local worktree line numbers. [Discussion instructions](https://docs.gitlab.com/api/discussions/#create-a-new-thread-in-the-merge-request-diff), [versions and SHA definitions](https://docs.gitlab.com/api/merge_requests/#retrieve-merge-request-diff-versions).

## New commits, resolved and outdated threads

Resolution and current-code applicability are distinct. The REST discussion schema documents resolution and `position`; it does **not** document an `outdated` Boolean or the full `original_position`/`change_position` model. First-party source preserves the original position and traces positions against the latest MR diff: if a position remains applicable it updates the current position; if outdated it records a change position. Its `active?` compares the current position's diff refs against the MR refs. [GitLab source: DiffPositionableNote](https://github.com/gitlabhq/gitlabhq/blob/master/app/models/concerns/diff_positionable_note.rb).

Consequently, an old `head_sha` alone is not a complete user-facing definition of “outdated”: GitLab can move a valid position forward. Nor should a resolved thread be assumed stale. The documented discussion-list endpoint lists all items and does not offer an unresolved-only filter; preserving imported discussion identity and revision information is possible even when current-code placement is unavailable. Exact visible remapping/outdated behavior on a target self-hosted version needs verification; this research does not promise perfect reattachment or infer undocumented REST fields.

Diff content can be limited: specific-version responses expose states such as `overflow`/`without_files`; `too_large` files cannot be retrieved and `collapsed` files require additional fetching. The latter response fields were introduced in GitLab 18.4. A product decision must cover threads whose corresponding diff cannot be displayed. [Diff version API](https://docs.gitlab.com/api/merge_requests/#retrieve-a-merge-request-diff-version), [diffs API](https://docs.gitlab.com/api/merge_requests/#list-merge-request-diffs).

## Local drafts, batching and duplicate risks

The user's selected MVP persists drafts locally. Direct discussion/reply creation publishes remotely when sent; it is not a GitLab pending review. GitLab separately offers Draft Notes CRUD: private to the author, new discussion or reply, with optional position and deferred resolution. Individual `PUT .../draft_notes/:id/publish` and `POST .../draft_notes/bulk_publish` exist. Bulk publishing publishes **all** that user's pending MR drafts, not a documented selected-ID subset; it can also add a summary/review state, which is not formal approval. This is a separate workflow outside the selected MVP. [Draft Notes API](https://docs.gitlab.com/api/draft_notes/).

The documented ordinary discussion/reply APIs are single-item writes. Their parameter lists do not provide a client operation ID, idempotency key or general multi-comment transaction. Neither these docs nor Draft Notes publication docs guarantee atomicity or duplicate-safe retry. This is an absence of a documented guarantee, not proof that every GitLab deployment lacks internal deduplication. First-party endpoint source also accepts position/body for creation and body for reply without an explicit idempotency parameter. [Discussions API](https://docs.gitlab.com/api/discussions/), [endpoint source](https://github.com/gitlabhq/gitlabhq/blob/master/lib/api/discussions.rb).

A timeout after sending therefore leaves a factual ambiguity: the server may have created the comment even if Chalk received no ID. Any “post all local drafts” behavior needs a product decision for partial success and uncertain outcomes. Retrying blindly cannot be advertised as safe; content matching cannot prove identity when repeated wording is legitimate. The report proposes no posting policy.

## Availability and evidence limits

The current Discussions, Notes and Draft Notes docs mark Free/Premium/Ultimate and GitLab.com/Self-Managed/Dedicated support. No paid tier is required by these core endpoint descriptions. This does not establish a minimum supported old self-hosted release: current documentation and moving source branches describe current capabilities; optional response fields and functionality vary by release. Authentication, permissions, deployment configuration and version support require the separate connection research/decision.

No credentials were used and no MR was read or modified. Findings were checked against official documentation; outdated-position behavior uses first-party source where REST documentation is narrower. Source links to `master` can change. Live cross-version compatibility, permissions for every write context, posting atomicity, and retry semantics were not experimentally verified and must not be promised by the outline.
