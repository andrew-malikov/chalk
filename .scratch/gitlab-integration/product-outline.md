# GitLab integration: first MVP

Agreed product outline, 2026-10-07. [Decision map](map.md) and its tickets hold the reasoning and research. This outline defines the first workflow; it is not an implementation specification.

## Users and review modes

Support both MR authors responding to feedback and reviewers starting discussions, on GitLab.com and self-hosted GitLab.

A Local review keeps today's MCP-created review workflow and has no GitLab discussions. A GitLab MR review is created through MCP from an MR URL. Chalk clones the repository into an independent managed location and owns source updates there. Repeated creation for the same MR reopens the existing review with its document and drafts.

The clone location is configurable. Documents and drafts live in durable app state separately from the clone, so source-cache cleanup does not discard the review. The user's editing repositories are outside this workflow.

## Connection

Use existing glab authentication for the MR's host and working Git credentials for private clone/fetch, through SSH or HTTPS. Chalk shows the posting account. Authentication failures preserve local state and explain what needs reconnecting.

## Discussions

A GitLab discussions panel provides access to every thread, navigation to matching local code, and corresponding markers beside code. General MR discussions and discussions that cannot be mapped remain accessible without a guessed code position.

Show open discussions by default. Resolved discussions are hidden behind an expandable count, such as `23 resolved threads`. Include actual discussion comments, including substantive bot comments; omit GitLab system activity. Keep these discussions distinguishable from local Ask conversations.

## Drafting and posting

Draft manually: reply inside a thread, start inline comments from a code selection, or start general comments from the panel. Autosave drafts locally, preserve them across closing/reopening, and provide explicit Discard.

Provide Post on each draft and Post all to attempt every unsent draft in the review. Confirmed successes are marked sent; unsuccessful attempts stay saved. Posting requires explicit user action. Provide a separate Resolve action that does not implicitly post or discard an unsent reply.

## Refresh

Refresh on opening the review and explicit Refresh; background polling is not required. Chalk fetches and advances its managed review repository when safe, preserving saved state if advancement cannot complete.

Keep draft text when the MR changes. Automatically remap inline draft locations where correspondence is clear; keep unmappable drafts saved and visibly flagged. Replies retain their discussion identity. Remapping does not publish drafts.

## Later work

Agent-assisted drafting, editing/deleting posted comments, GitLab pending-draft synchronization, in-app authentication, in-app MR creation, and conversion of existing Local reviews are outside this MVP.

The implementation specification still needs exact cache/reacquisition policies, supported GitLab/glab versions, credential access from the app process, revision/line mapping rules, and uncertain-post handling. Ordinary GitLab comment APIs do not document duplicate-safe retries; the outline makes no such guarantee.
