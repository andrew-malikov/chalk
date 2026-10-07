# Choose refresh behavior when discussions or code change

Parent: [GitLab integration MVP product outline](../map.md)
Type: grilling
Label: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: andrew
Blocked by: 02, 03, 04, 09, 10

## Question

When someone replies, resolves a thread, or pushes new commits in GitLab while Blackboard is open, when does the user see the change? Choose the MVP refresh behavior and what happens to a draft whose target code or discussion has changed. Consider manual refresh versus automatic refresh, and explain how source-linked and outdated discussions remain understandable without silently moving a draft onto different code. Include the case where GitLab supplies the discussion but its diff cannot be displayed because of size limits or missing source context.

## Comments

- User workflow: review checkouts are separate from editing checkouts. When the MR author pushes, updated source must be fetched locally into the review workflow. jj can record local edits as new commits immediately; a clean working tree is not evidence that there are no local deviations.
- User decision during source discussion: keep discussions visible when they cannot be mapped to local code.
- Advancement ownership is settled in [Choose how an MR maps to a Blackboard review](03-mr-entry-and-source.md): Blackboard fetches and advances the designated review checkout only when it has no local deviations. This ticket chooses refresh timing and draft/discussion behavior, rather than reopening advancement ownership.
- [Establish safe Git and jj review-checkout advancement](09-safe-review-checkout-advancement.md) confirms that an empty jj working-copy child can represent aligned MR source despite a different commit ID. Independent clones isolate automatic updates; shared jj workspaces share mutable history. Decide whether the MVP requires an independent review repository or also promises preservation of other workspaces during shared-repository updates.
- User decision: refresh on opening the review and explicit Refresh is sufficient for the MVP; background polling is not required.
- Source ownership is now under reconsideration in [Choose local and MR review kinds with managed repositories](10-review-kinds-and-managed-repositories.md). This ticket is open and unclaimed until that source-model prerequisite resolves. If the app owns an independent clone, shared-workspace support may no longer be part of this workflow.
- Source ownership is now settled in that ticket: GitLab MR reviews own independent app-managed clones. Shared jj workspaces and updating editing repositories are outside this workflow. Refresh on opening and explicit Refresh remains the selected timing. Preserve these decisions; the remaining question is how existing drafts and discussions behave when source advances.

## Answer

Refresh when the MR review is opened and on explicit Refresh. Background polling is not required. Blackboard fetches and advances the source in the MR review's independent managed clone; it does not update the user's editing repositories. Preserve the previous source and saved review state if advancement cannot be completed safely.

Preserve all unsent draft text. Remap inline draft locations automatically where correspondence to updated source is clear. Keep unmappable drafts saved and visibly flagged without guessing a new code location. Replies retain their discussion identity; general comments have no code position to remap. Imported discussions likewise remain accessible even when their source cannot be shown or mapped. Remapping does not post a draft.

A repeated MCP creation request for the same GitLab MR reopens the existing review with its document and drafts rather than creating another review. GitLab instance and project/MR identity must distinguish different MRs.

The user selected automatic draft remapping and reopening the existing review. Detailed mapping confidence, force-push behavior, and error presentation belong to the subsequent specification; the product outline promises preservation and visible unmappable state rather than perfect reattachment.
