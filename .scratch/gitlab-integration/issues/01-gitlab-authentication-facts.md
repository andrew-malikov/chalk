# Establish GitLab connection and authentication constraints

Parent: [GitLab integration MVP product outline](../map.md)
Type: research
Label: wayfinder:research
Mode: AFK
Status: resolved
Assignee: gitlab_auth_research
Blocked by: none

## Question

Which supported authentication approaches let a local desktop app read private MR discussions and post replies/new comments as its user on both GitLab.com and self-hosted GitLab? Establish the practical setup requirements, permissions, and host/version limitations for personal access tokens, existing `glab` credentials, and OAuth. Separate verified platform facts from recommended product choices. Research official primary sources without connecting to any user account or requesting credentials.

## Answer

User PATs, existing authenticated glab API calls, and OAuth all provide supported paths on GitLab.com and self-hosted GitLab. Legacy read access uses `read_api`; posting requires `api`. Current fine-grained PATs offer scoped alternatives on recent versions. Self-hosted OAuth requires instance-local application registration; account/organization policy and version differences constrain availability. This settles platform feasibility only; the connection method remains a product decision.

Findings and source citations: [GitLab authentication facts for the MVP outline](../research/authentication.md).

Research context: branch `research/gitlab-authentication`, commit `1e396032`, isolated worktree `/tmp/whiteboard-gitlab-auth-research`. Report copied into the main checkout for reading. No credentials or private deployments were used; minimum supported versions and runtime compatibility remain untested.
