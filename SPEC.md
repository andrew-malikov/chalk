# GitLab MR reviews

## §G

Authors + reviewers → create GitLab MR review through MCP; inspect discussions beside code; manually draft; explicitly post; refresh owned source safely. Approved product outline: `.scratch/gitlab-integration/product-outline.md`. Prototype primary source: branch `prototype/gitlab-discussions`; overall direction accepted, presentation evolves.

## §C

C1: Existing Local reviews + GitHub PR imports preserve behavior. No conversion of Local reviews.
C2: Bun/TypeScript/React/StyleX; existing SQLite + review API; no new dependencies. No README.md edits.
C3: GitLab.com + HTTPS self-hosted GitLab; canonical MR URL incl nested groups + port. User glab/Git auth; no stored tokens, login UI, agent drafting, remote pending drafts, or editing/deleting remote comments.
C4: Clone root `BLACKBOARD_GITLAB_CLONES_DIR`, else `<devReviewHome>/gitlab-clones`; independent clone per MR identity. Source disposable; review state durable. Clone-root changes apply to new reviews; existing MR reviews keep their registered clone path. No automatic cleanup; missing clone reacquired on refresh.
C5: API v4 Discussions + MR diff_refs via installed glab `api --hostname`; app process inherits PATH/environment, glab resolves its saved credentials. No historic-version guarantee; missing CLI/auth/API capabilities explain recovery without discarding state.
C6: UI starts with expandable right-side discussions panel in existing review shell. Open default; resolved expandable; substantive bot notes included; system notes omitted. Ask separate. Styling/layout may evolve.

## §I

I.create: existing review_create gains mergeRequestUrl; incompatible with local pins/target/repositoryId/pullRequestUrl/scratchpad/reuseExisting:false. Repeated host + project ID + MR IID → same review. Existing command receipts preserved.
I.state: GET /:id/gitlab → cached identity/account/discussions/drafts + connection/source issues. POST /:id/gitlab/refresh → API + safe fetch/reacquisition; no background polling.
I.drafts: POST /:id/gitlab/drafts → save id/text/target with optimistic revision; POST /:id/gitlab/discard → explicit local discard. Targets: general; reply by discussion ID; inline by file/side/line range + diff_refs.
I.post: POST /:id/gitlab/post → one draft or all unsent; confirmed note receipt persisted; failures saved; interrupted/unacknowledged attempts visibly uncertain. Separate POST /:id/gitlab/resolve preserves replies. Explicit uncertainty recovery requires user's verification, never text-matching guesses.
I.ui: GitLab context under ReviewSession; integrated panel + code markers + manual inline action on code selection; mapped thread reveals local code. General/unmapped threads stay accessible. Account + MR host visible.

## §V

V1: URL validation before subprocess/network; path traversal, credentials, query/hash, malformed IID rejected. Request host explicit; clone transport belongs to MR host. Remote fields validated; no raw credentials in API errors.
V2: MR create deduplicates identity, preserves existing document/drafts; managed clone separate from user editing repos. Failed/repeated creation cannot create duplicate reviews.
V3: Draft edits durable across store reopen; optimistic revisions reject stale saves; sending/uncertain/sent cannot be silently overwritten. Text survives remote errors, resolve, and refresh.
V4: Only explicit Post/Post all mutates remote notes. Post all attempts every unsent draft independently; confirmed successes aren't resent; failures remain; sending recorded before request. Unconfirmed result never automatically retried.
V5: Resolve only affects remote resolution; saved draft unchanged. Paginated import keeps all actual comments, omits system notes, preserves unmapped/resolved access.
V6: Refresh refuses dirty checkout or committed HEAD deviation; no forced reset/checkout. Fetch/reacquire + checked advancement before repin; failure preserves old pins/document/drafts. No document lease bypass.
V7: Inline remapping requires exact unambiguous context correspondence; otherwise preserve text + original target flagged unmapped. Reply IDs stable; general targets untouched. Range targets use current GitLab diff refs; no guessed positions.
V8: Local reviews expose no GitLab panel/mutations. Historical/shared reviews cannot publish GitLab drafts. Autosave ordering flushes before post/discard; failed save stays visible with unsaved editor text.
V9: Imported thread replies/resolution/refresh update both panel + code markers without reloading the review.

## §T

id|status|goal|cites
---|---|---|---
T1|x|GitLab protocol, URL/transport/source mapping + meaningful tests|V1,V5,V7,I.create,I.ui
T2|x|Durable GitLab state + posting/refresh service + managed MR creation + API tests|V2,V3,V4,V5,V6,V7,I.create,I.state,I.drafts,I.post
T3|x|Integrate production discussions panel, selection drafting, code markers/navigation + interaction tests|V3,V5,V8,V9,I.ui
T4|x|Run affected tests, typecheck, lint, build + whole-suite regression checks; record limits|V1,V2,V3,V4,V5,V6,V7,V8,V9

## §B

id|date|cause|fix
---|---|---|---
B1|2026-10-07|Broad text replacement inserted an import inside a function; input test assumed Promise rejection for a synchronous schema guard|Typecheck + correct boundary assertion; existing V1 sufficient
B2|2026-10-07|Installed Bun 1.2.15 cannot initialize current jsdom VM context|Use temporary project-required Bun 1.4.2; environment mismatch, no new invariant
B3|2026-10-07|Diff annotation cache ignored changed discussion metadata when item version stayed unchanged|V9; bump annotation revision on imported thread changes + browser regression
B4|2026-10-07|Inline target retained client-supplied opposite file path, allowing unrelated-file hunks in coordinate calculation|V1,V7; derive both paths from actual Git name-status data + integration assertion
B5|2026-10-07|Posting compared MR refs with cache but omitted the draft position after a concurrent refresh skipped remapping|V4,V7; compare draft refs with displayed pins + current refs before remote write, keep preflight failures editable
B6|2026-10-07|Reacquisition derived checkout from current clone-root config while review pins retained the original repository path|V2,V6; reuse registered managed path, prevent MR source reassignment, reopen/reacquire regression
