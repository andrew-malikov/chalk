# GitLab integration MVP product outline

Label: wayfinder:map
Status: resolved

## Destination

Agree on a small product outline for displaying GitLab MR discussions in Chalk, drafting replies and new comments, and explicitly posting them. The route is clear when the first user journey and MVP boundaries are agreed; a detailed specification and implementation come afterward.

## Notes

- Agreed artifact: [GitLab integration: first MVP](product-outline.md).
- Both MR authors and reviewers are first-class MVP users.
- Support both GitLab.com and self-hosted GitLab.
- Users write drafts manually. Posting requires an explicit user action. Agent assistance was removed from the MVP during the drafting decision.
- Entry point: paste a GitLab MR URL.
- Review modes: Local review preserves today's workflow; GitLab MR review is created through MCP from the MR URL and owns an independent, app-managed clone in a configurable location.
- Connection: existing glab authentication for the MR host, plus working Git credentials for managed clone/fetch. In-app authentication is outside this MVP.
- New comments can start both inline code discussions and general MR discussions.
- Unpublished drafts persist locally in Chalk; synchronizing drafts with GitLab is beyond this MVP.
- Consult wayfinder, grilling, and domain-modeling when working a decision; research tickets consult research, and presentation tickets consult prototype.
- This effort plans the product; it does not implement the integration.
- Tracker: local Markdown fallback. Child tickets live in `issues/`; `Blocked by` records dependencies. An open, unassigned ticket whose blockers are resolved is on the frontier. Claim before work; record answers on the ticket, not here.
- Existing Chalk imports GitHub PR revisions but has no remote review-comment model. Existing Ask conversations are local agent conversations, not GitLab discussions.
- Candidate vocabulary, to confirm in the relevant tickets: discussion = a GitLab thread; comment = one message; draft = an unpublished proposed reply or new comment.

## Decisions so far

- [Establish GitLab connection and authentication constraints](issues/01-gitlab-authentication-facts.md): User PAT, glab, and OAuth paths exist on both offerings; host registration, permission scope, policy, and versions constrain setup.

- [Establish GitLab discussion, draft, and posting capabilities](issues/02-gitlab-discussion-facts.md): Core thread import/reply/general-inline posting is available; remote revision anchors and undocumented retry guarantees constrain the outline.
- [Choose how an MR maps to a Chalk review](issues/03-mr-entry-and-source.md): Earlier attachment/local-source model, superseded by [Choose local and MR review kinds with managed repositories](issues/10-review-kinds-and-managed-repositories.md).
- [Choose the discussion review surface](issues/04-discussion-review-surface.md): Use a discussions panel and local code markers; open threads appear by default, resolved threads expand from a count, and system activity is omitted.
- [Choose the draft lifecycle and agent assistance](issues/05-draft-lifecycle.md): Draft manually in threads, from code selections, or from the panel; autosave locally, retain drafts across reopening, and provide explicit discard.
- [Choose explicit posting behavior and recovery from partial failure](issues/06-posting-contract.md): Post individually or attempt every unsent draft with Post all; confirmed successes are marked sent, and Resolve is a separate action.
- [Establish safe Git and jj review-checkout advancement](issues/09-safe-review-checkout-advancement.md): Normalize empty jj working-copy children; committed deviations and shared-workspace fetch effects constrain automatic advancement.
- [Choose local and MR review kinds with managed repositories](issues/10-review-kinds-and-managed-repositories.md): Separate Local and GitLab MR reviews; MCP creates MR reviews with independently managed clones in a configurable location.
- [Choose refresh behavior when discussions or code change](issues/07-refresh-and-changed-code.md): Refresh on opening and explicit Refresh, preserve/remap drafts, and reopen the existing review for repeated MCP creation of the same MR.
- [Choose the first connection experience for both GitLab hosts](issues/08-connection-experience.md): Reuse glab authentication and working Git transport credentials; show the posting account and preserve state when reconnection is needed.
- [Establish authentication for managed private GitLab clones](issues/11-private-clone-authentication.md): glab API login must be paired with working Git HTTPS credentials/helper or SSH setup; login alone does not establish private clone/fetch access.

## Not yet specified

- None for this product-outline effort. All decision tickets are resolved. Detailed cache lifecycle, uncertain-post reconciliation, mapping rules, and version compatibility belong to the subsequent specification.

## Out of scope

- Detailed implementation specifications, architecture plans, and product implementation: this effort ends at an agreed product outline.
- Synchronizing unpublished drafts with GitLab's pending review drafts: the agreed MVP keeps drafts local.
- Agent-assisted drafting: removed from the first MVP because it is too large a topic; see [Choose the draft lifecycle and agent assistance](issues/05-draft-lifecycle.md).
- Editing and deleting posted GitLab comments: deferred by the user while choosing posting actions; the MVP includes resolving discussions.
- Converting or attaching GitLab to existing Local reviews, in-app MR review creation, and updating a user's editing repository: the selected MVP creates a separate MR review through MCP with its own clone.
- In-app authentication and historical-version compatibility guarantees: the MVP uses existing glab/Git setup, with exact supported versions to be specified and verified later.
