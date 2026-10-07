# Git and jj constraints on advancing a review checkout

Researched 2026-10-07 against current official documentation and this repository at `e005c876`. Scope: facts and product-outline constraints for app-managed advancement; no checkout algorithm, implementation, account access, or user-repository mutation experiments.

## Feasibility and alignment

App-managed advancement is feasible, but “no local deviations” must mean the selected review checkout still represents the last agreed MR revision. A clean status alone does not establish that.

- Git status compares the index, working files, and `HEAD`; it does not establish that `HEAD` equals an external MR revision. Thus a clean checkout containing a locally committed change still deviates. Check both revision identity and local file state. [Git status](https://git-scm.com/docs/git-status#_description).
- jj snapshots files into its working-copy commit. New files are normally tracked automatically, subject to ignore and auto-track settings. Local edits can become committed deviations without a separate commit action. [jj working copy](https://docs.jj-vcs.dev/latest/working-copy/#introduction).
- A normal jj workspace can have an empty working-copy commit on top of a remote revision. Its commit ID differs from the MR commit although its source has no changes. The documented workspace creation model makes a new working-copy child of the selected parent revision. [jj workspace CLI](https://docs.jj-vcs.dev/latest/cli-reference/#jj-workspace-add). jj exposes commit emptiness and parent identities. [jj templates](https://docs.jj-vcs.dev/latest/templates/#commit-type).

Product inference: record the agreed MR source revision separately from the local working-copy revision. Accept an empty jj working-copy child directly based on that agreed revision as an aligned state. A new nonempty child, an empty child based on a locally changed parent, a rewritten agreed commit, or an ambiguous/multiple-parent state requires pausing rather than treating the checkout as untouched. Tree equality alone cannot establish agreed committed history. Unrelated local commits elsewhere in the repository need not themselves imply a deviation in the selected checkout.

## Separation between review and editing checkouts

Git linked worktrees have their own `HEAD` and index, while ordinary refs and the object database are shared. Correctly scoped checkout movement can therefore leave editing files and its `HEAD` unchanged; arbitrary shared branch movement is a different operation. [Git worktree details](https://git-scm.com/docs/git-worktree#_details).

jj workspaces also have separate working copies, but share repository history. Rewriting another workspace's current commit can make that workspace stale. [jj workspaces and stale copies](https://docs.jj-vcs.dev/latest/working-copy/#workspaces). In colocated Git/jj, both tools share the same working files, with automatic ref import/export on jj commands; non-colocated backing-store refs can instead be stale. The official compatibility table does not support Git worktrees as a jj workspace mechanism. [jj Git compatibility](https://docs.jj-vcs.dev/latest/git-compatibility/).

Important constraint: jj imports can abandon commits that become unreachable from Git and rebase their descendants; the documented `git.abandon-unreachable-commits=false` setting disables that behavior. [jj configuration](https://docs.jj-vcs.dev/latest/config/#abandon-commits-that-became-unreachable-in-git). Fetch explicitly documents remote-unreachable abandonment. [jj fetch CLI](https://docs.jj-vcs.dev/latest/cli-reference/#jj-git-fetch).

Product inference: separate folders alone do not guarantee that the editing state is unaffected, especially after rewritten MR history. A separate clone isolates this shared-history effect. Supporting shared jj workspaces requires behavior that also preserves other workspace revisions; if that cannot be established, pause. Default jj fetch cannot be advertised as universally harmless to editing state.

## Advancement and rewritten history

Git fetch receives objects and updates configured refs; it ordinarily refuses to update the currently checked-out branch directly. Fetch can detect forced updates. [Git fetch](https://git-scm.com/docs/git-fetch). Git switch updates the worktree/index and normally refuses when changes would be lost, but permits some local edits to survive. Its refusal is therefore a useful safeguard, not proof of the stricter selected product condition of zero deviations. [Git switch](https://git-scm.com/docs/git-switch#_description).

Product inference: ordinary MR pushes can advance an unchanged review checkout. A force-push does not by itself prove local deviation, but needs the same unchanged-state and isolation guarantees against the old agreed revision. Otherwise pause; do not silently merge/rebase the user's local work. Rewritten history can invalidate old discussion/draft positions, requiring the separate refresh decision. Recheck eligibility when advancing, since local edits or the MR can change during a fetch. Conflicts, unknown state, missing/inaccessible revision, stale workspace, an unfinished VCS operation, or files that would be overwritten are reasons to pause.

## What existing Blackboard code establishes

The `LocalVcs` interface primarily resolves revisions and reads/diffs source; it contains no review-checkout fetch/advance contract. Detection prefers jj. `currentHeadForKind` returns jj `@` or Git `HEAD`; jj revision reads use `--ignore-working-copy`. Existing read paths therefore provide neither empty-child normalization nor a fresh file-state eligibility guarantee. [VCS code](../../../packages/local-vcs/src/vcs.ts).

The official flag means no snapshot and no working-copy update, so the queried commit can be stale. This is appropriate for read paths but insufficient alone for safe advancement. [jj global options](https://docs.jj-vcs.dev/latest/cli-reference/#options).

The code distinguishes shared-store Git commands (`git`) from worktree-local commands (`gitAt`); jj workspace current commits are also enumerated for note retention. Those distinctions are directly relevant to avoiding accidental operations on the editing checkout. [VCS helpers](../../../packages/local-vcs/src/vcs.ts), [notes implementation](../../../packages/local-vcs/src/notes.ts).

## Evidence limits

Current documentation establishes capabilities and hazards, not a proven cross-version implementation. No live GitLab MR or installed Git/jj behavior was tested. This report does not select minimum VCS versions, refresh timing, force-push UX, or shared-workspace support policy. The small outline can retain automatic advancement with a mandatory pause whenever preservation of local and other-workspace state cannot be established.
