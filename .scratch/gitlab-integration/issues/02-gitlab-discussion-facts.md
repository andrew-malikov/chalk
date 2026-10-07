# Establish GitLab discussion, draft, and posting capabilities

Parent: [GitLab integration MVP product outline](../map.md)
Type: research
Label: wayfinder:research
Mode: AFK
Status: resolved
Assignee: gitlab_discussion_research
Blocked by: none

## Question

What does GitLab expose for reading MR discussion threads, replying, starting general and inline discussions, and saving or publishing pending review drafts? Establish the identities and revision/line anchors needed, behavior after new commits, resolved/outdated discussion visibility, and any documented support for batching or duplicate-safe posting. Explain which platform constraints affect MVP product decisions, including GitLab.com/self-hosted availability. Research official primary sources; do not implement a client or post anything.

## Answer

GitLab's core REST APIs support importing discussion threads, replying by discussion ID, and starting both general and inline discussions across GitLab.com and Self-Managed without a paid-tier dependency in current documentation. Inline comments require remote diff-version SHAs, old/new paths and side-specific line coordinates. Resolution and outdated placement are distinct; current REST documentation does not expose a complete outdated-state contract. Ordinary published-comment endpoints provide single-item writes and no documented idempotency/atomic batch guarantee, so posting timeouts and partial batches remain product decisions. GitLab pending-review APIs exist but are outside the agreed local-draft MVP.

Report: [GitLab discussion and posting facts](../research/discussions.md).

Context: throwaway branch `research/gitlab-discussions`, commit `5874cdc71c8bff2ebd1c3b51d3d12b11d81a2d70`; worktree `/tmp/whiteboard-research-gitlab-discussions`. Official documentation and first-party source only; no credentials, live instance testing or external posting. Minimum self-hosted version and uncertain-outcome behavior remain undecided.
