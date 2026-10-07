# Choose the first connection experience for both GitLab hosts

Parent: [GitLab integration MVP product outline](../map.md)
Type: grilling
Label: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: andrew
Blocked by: 01, 11

## Question

Given the verified authentication constraints, what minimum setup should a user perform to read and post as themselves on GitLab.com or a self-hosted instance? Choose the MVP connection experience, including whether existing CLI authentication is sufficient or a direct app connection is essential, how the user knows which host/account will post, and what happens when authentication expires. State the promised self-hosted compatibility baseline, or explicitly leave it for the subsequent specification with the outline's limits recorded. Do not turn this product decision into an implementation specification.

## Comments

- [Establish authentication for managed private GitLab clones](11-private-clone-authentication.md) confirms that glab API authentication and Git transport authentication are distinct setup requirements. A glab-based MVP can use the authenticated CLI for discussions and existing SSH/HTTPS Git credentials for managed clone/fetch. No in-app OAuth or token entry is necessary if that setup is acceptable to the user.

## Answer

Require existing glab authentication for the MR's GitLab host and working Git transport credentials for clone/fetch. Git and glab must be available to Blackboard, including their relevant credential helper or SSH setup. Use glab for discussion API reads and writes, and existing Git credentials for the managed source repository. This applies to both GitLab.com and self-hosted GitLab. An in-app OAuth or token-entry flow is outside the first MVP.

Select the host from the MR URL and show the account used for posting. If API or Git authentication becomes unavailable or expires, preserve the saved review and drafts and report the reconnection requirement; do not discard state or silently switch account/host.

The user approved the proposed glab-based setup. The outline supports both offerings but does not promise all historical server/CLI releases or corporate configurations. Exact minimum versions, GUI-process access to credentials, and transport/runtime compatibility checks belong to the subsequent specification and validation. The research identifies those limits without claiming live private-deployment testing.
