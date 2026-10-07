# Choose the draft lifecycle and agent assistance

Parent: [GitLab integration MVP product outline](../map.md)
Type: grilling
Label: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: andrew
Blocked by: 02

## Question

Given that unpublished replies and new comments persist locally in Blackboard, what does the user edit, save, discard, and ask an agent to help write? Define how a draft targets an existing discussion or a new discussion and the minimum persistence promise when the app is closed. The initial brief included agent assistance; it may be scoped out through this decision. Synchronization with GitLab's pending review drafts is outside this MVP.

## Comments

- Charting input from the user: persist unpublished drafts locally in Blackboard; support manual drafting with agent assistance.

## Answer

The MVP supports manual drafting only. Reply within an existing GitLab thread, start a new inline discussion from a local code selection, and start a general MR comment from the discussions panel. Drafts autosave locally, survive closing and reopening the review/application, and have an explicit Discard action. They remain unpublished until the user explicitly posts them.

Agent assistance is outside this MVP: the user judged it too large a topic for the first version. This supersedes the initial requirement for agent-assisted drafting; the manual draft workflow remains in scope. No agent-drafting flow or integration is required by the product outline.

Posting granularity and recovery remain in [Choose explicit posting behavior and recovery from partial failure](06-posting-contract.md). Synchronization with GitLab pending-review drafts remains out of scope.
