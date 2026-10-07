# Choose local and MR review kinds with managed repositories

Parent: [GitLab integration MVP product outline](../map.md)
Type: grilling
Label: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: andrew
Blocked by: 03, 09

## Question

Should the first MVP distinguish a local review, with today's source workflow and no GitLab discussions, from an MR review that Blackboard creates from an MR URL and supplies with its own cloned repository? This revisits the earlier decision to attach GitLab to an existing local review. Decide whether the two modes are separate or local reviews can be converted, how the workflow begins through MCP or the app, and the ownership/lifecycle of the managed clone in a configurable location. Distinguish disposable source checkout storage from durable review documents and local drafts. If Blackboard owns the clone, determine whether native Git is sufficient even when the user edits with jj elsewhere.

## Comments

- User proposal: existing local reviews are created through MCP and have no GitLab/discussion integration; a remote review type could make Blackboard clone the repository itself into a configurable temporary directory.
- [Establish safe Git and jj review-checkout advancement](09-safe-review-checkout-advancement.md) supports isolation through independent repositories; the managed clone proposal could remove the shared editing/review workspace problem.
- This is an open proposal, not a replacement decision yet. The initial attach-existing-local-review model remains historical context until this ticket resolves.

## Answer

Use two review modes for the first MVP. A Local review preserves today's MCP-created review workflow and uses user-provided local source without GitLab discussions. A GitLab MR review is created through MCP from an MR URL; Blackboard acquires and owns an independent cloned repository and provides the GitLab discussion workflow. An in-app MR-creation input is not required for this MVP.

This replaces the earlier model of attaching GitLab discussions to an existing Local review. Conversion of an existing Local review is not required by the separate-mode MVP. The editing repository, whether Git or jj, is outside Blackboard's MR checkout advancement workflow.

The managed clone location must be configurable. Treat the clone as cache/source storage, while keeping review documents and local drafts in durable app state. Reacquiring source must not mean discarding the saved review or drafts. Exact cache defaults, cleanup, and reacquisition policies can be specified after the small product outline.

The user explicitly approved separate modes replacing attachment to existing Local reviews and MCP-first creation. The existing discussion panel, manual drafting, Post/Post all, and separate Resolve decisions apply to GitLab MR reviews.
