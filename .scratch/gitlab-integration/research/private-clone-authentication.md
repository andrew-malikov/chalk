# Authentication for app-managed private GitLab clones

Researched 2026-10-07. Official documentation plus glab source snapshot `41771b819e87c5ab6dac398403424cbaf16358c0`. No credentials or accounts accessed; no clone/fetch was executed.

## Verified conclusion

**An authenticated glab is sufficient for authorized discussion API calls, but is not proof that private cloning/fetch works.** Git transport must also authenticate. HTTPS can reuse glab credentials through Git's credential-helper configuration; SSH requires a separately working SSH setup. This is a platform constraint, not selection of an MVP transport.

`glab repo clone` supports a destination directory, configured SSH/HTTPS protocol and Git flags. Current source resolves repository metadata when needed, then delegates to `git.RunClone`; it does not independently supply API credentials to the Git process. Subsequent Git fetches therefore need the same working transport authentication. [Clone docs](https://docs.gitlab.com/cli/repo/clone/), [Clone source](https://gitlab.com/gitlab-org/cli/-/blob/41771b819e87c5ab6dac398403424cbaf16358c0/internal/commands/project/clone/repo_clone.go).

## HTTPS and glab login

Interactive login with HTTP/HTTPS offers “Authenticate Git with your GitLab credentials?”. If accepted and no existing helper is configured, glab writes a host/protocol-specific global Git helper invoking `glab auth git-credential`. If another helper exists, login instead rejects cached credentials and approves the token through that existing helper. Declining the prompt leaves Git setup separate. Current non-interactive token/stdin and job-token login branches return before this interactive helper setup. **Thus `glab auth login --token` success, or simply setting a token environment variable, must not be treated as establishing Git authentication.** [Login source](https://gitlab.com/gitlab-org/cli/-/blob/41771b819e87c5ab6dac398403424cbaf16358c0/internal/commands/auth/login/login.go), [Helper setup source](https://gitlab.com/gitlab-org/cli/-/blob/41771b819e87c5ab6dac398403424cbaf16358c0/internal/commands/auth/authutils/git_credentials.go).

The glab Git helper receives Git's HTTP/HTTPS credential request and selects credentials using the request's `host` (including its explicit port). Its current OAuth path resolves an API credential, allowing token refresh; PAT and job-token paths return their corresponding stored token. When a different helper cached an OAuth access token, automatic glab refresh cannot be assumed. Version compatibility of helper/keyring/refresh should be verified for the actual supported CLI release. [Helper implementation](https://gitlab.com/gitlab-org/cli/-/blob/41771b819e87c5ab6dac398403424cbaf16358c0/internal/commands/auth/login/helper.go), [OAuth Git authentication](https://docs.gitlab.com/api/oauth2/#access-git-over-https-with-access-token).

## Permissions

- Legacy user PAT `api` covers API read/write and Git-over-HTTP repository access. `read_repository` covers cloning/pulling but cannot replace `api` for posting discussions. `read_api` alone is insufficient for the combined workflow. User access to the actual project is still required. [PAT scope table and footnote](https://docs.gitlab.com/security/tokens/access_token_scopes/).
- OAuth Git-over-HTTPS explicitly documents `read_repository` or `write_repository`. For API posting plus source reads, require the applicable API write scope and repository read capability. glab's documented login setup requests `api` and `write_repository` for PATs, and its self-hosted OAuth setup includes both; that is CLI-wide setup, broader than source-reading alone needs. Fine-grained PATs require endpoint and Git permissions appropriate to the supported server version; this investigation does not establish a minimal fine-grained bundle. [OAuth Git scopes](https://docs.gitlab.com/api/oauth2/#access-git-over-https-with-access-token), [CLI authentication prerequisites](https://docs.gitlab.com/cli/authentication/).

## SSH and host selection

SSH needs a private key available to SSH, its public authentication key registered with GitLab, and working host verification/SSH-agent configuration. API OAuth/PAT login does not supply an SSH private key. The account selected by SSH can differ from the API account; both need project access. [GitLab SSH setup](https://docs.gitlab.com/user/ssh/).

For managed clones outside a developer checkout, select the target GitLab host explicitly rather than relying on the current repository. glab API supports `--hostname`; cloning supports `GITLAB_HOST` plus host configuration. API host/port and SSH host are separate settings. Login source accepts `--api-host` as hostname or hostname:port and documents SSH port coming from the remote URL. HTTP/HTTPS Git credentials match the Git remote's actual host/port, so a different API host is not proof its credential configuration matches the clone endpoint. [CLI configuration](https://docs.gitlab.com/cli/configuration/), [Login source](https://gitlab.com/gitlab-org/cli/-/blob/41771b819e87c5ab6dac398403424cbaf16358c0/internal/commands/auth/login/login.go), [API command](https://docs.gitlab.com/cli/api/).

## Constraints to carry into the connection decision

A justified glab-based prerequisite is **Git and glab available to the app; authenticated API access for the chosen host/account; working Git clone/fetch authentication for that repository using HTTPS helper or SSH**. Do not reduce that requirement to “signed into glab”. The app process must inherit the relevant configuration and be able to access keyring/helper or SSH agent without an interactive terminal. This last point is an operational inference from subprocess/credential behavior.

Not verified: minimum CLI release supporting every inspected behavior, corporate TLS/proxies or custom SSH ports at runtime, GUI process environment/keyring access, fine-grained token combinations, submodules/LFS, and live OAuth refresh. Main-branch source explains current behavior, not a compatibility guarantee for every installed release.
