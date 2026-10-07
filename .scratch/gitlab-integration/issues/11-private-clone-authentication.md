# Establish authentication for managed private GitLab clones

Parent: [GitLab integration MVP product outline](../map.md)
Type: research
Label: wayfinder:research
Mode: AFK
Status: resolved
Assignee: gitlab_auth_research
Blocked by: 01, 10

## Question

For MCP-created GitLab MR reviews with app-managed clones, which existing authentication approaches cover both discussion API read/write and cloning/fetching private repository source? Verify current glab login/repo clone behavior, HTTPS credential helper setup, SSH prerequisites, host selection, and relevant token scope differences from official primary sources. Identify whether requiring authenticated glab alone is sufficient or whether the user also needs working Git transport credentials. Do not access accounts, expose tokens, clone private repositories, or implement a client. Produce factual setup constraints for the final connection decision, not a new product choice.

## Answer

Authenticated glab alone does not establish private Git transport authentication. glab repo clone delegates to Git. HTTPS can reuse glab credentials when Git's helper is configured; interactive login offers that setup, but non-interactive token/stdin login does not automatically establish it. SSH needs working keys/agent/host verification separately. Carry forward glab API authentication plus already working Git clone/fetch credentials as the factual setup constraint; transport selection remains a product decision.

Findings: [Authentication for app-managed private GitLab clones](../research/private-clone-authentication.md).

Research context: branch `research/gitlab-clone-authentication`, commit `22b285a9`, isolated worktree `/tmp/whiteboard-gitlab-clone-research`; report copied to main checkout. No accounts, credentials, or private clones accessed. CLI-version compatibility, GUI process credential access and OAuth refresh were not runtime-tested.
