# Establish safe Git and jj review-checkout advancement

Parent: [GitLab integration MVP product outline](../map.md)
Type: research
Label: wayfinder:research
Mode: AFK
Status: resolved
Assignee: git_jj_advancement_research
Blocked by: 03

## Question

For the selected product contract, can Blackboard fetch and advance a designated local review checkout to new GitLab MR revisions without overwriting local deviations or affecting a separate editing checkout? Establish relevant Git and jj facts from official sources and the repo's existing VCS code. In particular, distinguish a jj working-copy changeset from the MR's committed source revision, account for an empty working-copy commit, and explain what observable state represents a local deviation. Cover ordinary pushes and rewritten MR history only to identify product constraints. Do not implement checkout mutation or decide refresh timing; identify any case in which the product should pause rather than promise an automatic update.

## Answer

Automatic advancement is feasible when the selected review checkout still represents the last agreed MR revision and its local state can be preserved. Clean status is insufficient: locally committed deviations still count. An empty jj working-copy child of the agreed MR revision represents aligned source despite having a different commit ID. Existing Blackboard revision reads return jj `@` without snapshotting, so they do not alone establish either correspondence or fresh update eligibility.

Separate Git worktrees and jj workspaces have independent working files but shared repository state. In particular, default jj fetch/import after rewritten remote history can abandon old commits and rebase descendants, potentially changing another workspace's revision. A separate clone isolates that effect; shared-workspace support must preserve other workspace state or pause. Force-pushes need unchanged-state and isolation checks, not automatic merging/rebasing of local changes.

Findings and official source citations: [Git and jj constraints on advancing a review checkout](../research/review-checkout-advancement.md).

Research context: branch `research/git-jj-review-advancement`, commit `a5c91f72`, isolated worktree `/tmp/whiteboard-research-git-jj-review-advancement`. Only the report was committed and copied into the main checkout. No credentials, live MRs, product code, or user source checkouts were modified. This resolves platform research; refresh timing and shared-workspace product support remain product decisions.
