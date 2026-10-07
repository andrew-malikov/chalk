# Choose how an MR maps to a Blackboard review

Parent: [GitLab integration MVP product outline](../map.md)
Type: grilling
Label: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: andrew
Blocked by: none

## Question

Given the agreed entry point of pasting an MR URL, does opening it create a dedicated MR review or attach it to an existing Blackboard review, and which source revisions does that surface represent? Use the existing URL-only GitHub PR entry point as context, without assuming its behavior is the desired GitLab behavior.

## Comments

- Charting input from the user: paste an MR URL. Automatic discovery is not required for this entry point.
- Current-code evidence: GitHub URL-only creation fetches and pins the remote diff (`packages/review/src/review-api/local-data.ts:1008`). Explicit targets/pins can instead link the PR identity to other source (`store.ts:1490`). Reopening an existing review preserves its document and source pins and reports a moved head rather than refreshing silently (`store.ts:1539`). Remote identity, reviewed source, and refresh behavior are separate choices.
- First discussion round: decide dedicated/reopened MR review versus attachment to an existing review; independently choose fetched MR diff versus existing pinned source or unpublished local source. Recommendation: dedicated persistent review showing the fetched MR diff. Awaiting user decisions; refresh timing belongs to the refresh ticket.
- User decision: attach the MR to an existing Blackboard review; use the user's local checkout, including unpublished changes. The dedicated remote-diff review recommendation was not selected.
- Follow-up needed before resolution: for an existing commit-pinned review, does attachment switch its code source to the local checkout, or require the user to switch it separately? Remote discussion placement and posting drafts on unpublished lines remain decisions in the dependent tickets.
- User clarification supersedes the source-switch framing: import comments from GitLab and map them onto the existing local source. If commits differ such that the states do not agree, show that the review cannot attach. Clarify the exact commit compatibility gate and distinguish commit mismatch from unpublished edits on an agreed commit before resolving.
- User decision: if a discussion cannot be mapped onto local code, keep it visible rather than blocking the whole attachment.
- User workflow clarification: review repositories/checkouts are separate from editing repositories/checkouts. With jj, edits rapidly become changesets/commits, so divergence is not limited to uncommitted working-tree changes. When the MR author pushes changes, the review source must be fetched locally. Establish who advances the selected review checkout before resolving the source workflow; detailed refresh and draft behavior belong to the refresh ticket.

## Answer

Attach the pasted GitLab MR URL to an existing Blackboard review. Comments and discussion identity come from GitLab; displayed source comes from the designated local review checkout, which is separate from the user's editing checkout. Attachment does not replace that source with a dedicated remote-diff review.

Initial attachment requires an agreed committed MR/local source state. If those states disagree, report that the review cannot attach. Local unpublished changes remain possible; a discussion that cannot be placed reliably in local code stays visible without a local position.

When the MR author pushes, Blackboard fetches and advances the review checkout itself, provided it has no deviations from the last agreed MR state. If it has local deviations, pause advancement and report the mismatch; do not overwrite those deviations. The editing checkout is not advanced by this workflow. Detecting deviations must account for jj changesets/commits, not just uncommitted Git-style changes.

The user selected app-managed advancement (option A). Refresh timing, preservation of drafts across updates, and stale-posting behavior remain questions in [Choose refresh behavior when discussions or code change](07-refresh-and-changed-code.md). The exact Git/jj correspondence and safe advancement constraints require platform research; this answer records the product contract, not a checkout algorithm.

## Subsequent reconsideration

The user proposed separate local and remote/MR review types, with Blackboard cloning and owning the remote review repository. [Choose local and MR review kinds with managed repositories](10-review-kinds-and-managed-repositories.md) determines whether this replaces the existing-local-review attachment decision. Keep the earlier answer as history; do not treat it as the final source model while that ticket is open.
