# Choose the discussion review surface

Parent: [GitLab integration MVP product outline](../map.md)
Type: prototype
Label: wayfinder:prototype
Mode: HITL
Status: resolved
Assignee: andrew
Blocked by: 02, 03

## Question

Where should imported discussions appear in Blackboard so both authors and reviewers can navigate them and understand their code context? Both inline discussions and general MR comments are required. Choose which user comments, system events, and resolved discussions are visible by default. Compare a cheap outline or mockup of a discussion list and source-linked threads, including a general discussion and a resolved or outdated thread. Keep GitLab discussions distinguishable from local Ask conversations. The user must react to the prototype before this ticket resolves.

## Comments

- Charting input from the user: support new comments anchored to code lines and general MR comments.
- Source decision: discussions are imported into an existing review whose source is the designated local review checkout. A discussion without a reliable local mapping must remain visible. The surface therefore needs a place for general and unmapped discussions as well as source-linked ones.
- User selected presentation A: a discussions panel listing every thread, navigation to local code, and markers beside matching code. General and unmapped discussions stay accessible in the panel. Default visibility of resolved threads and system activity remains to be decided before resolution.

## Answer

Use a GitLab discussions panel in the existing Blackboard review. It provides access to every imported thread, navigates to matching local code, and has corresponding markers beside matching code. General MR discussions and threads without reliable local mappings stay visible in the panel without a guessed local position. Keep GitLab discussions distinguishable from local Ask conversations.

Show open threads by default. Hide resolved discussions behind an expandable count, such as `23 resolved threads`; expanding that item reveals them in the panel. Include discussion comments, including substantive bot comments, and omit GitLab system events.

The user selected panel proposal A, then chose the open-thread default with expandable resolved count and discussions-only content. Captured asset: [GitLab discussions panel: agreed product outline](../assets/discussions-panel-outline.md).
