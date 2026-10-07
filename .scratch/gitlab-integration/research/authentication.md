# GitLab authentication facts for the MVP outline

Researched 2026-10-07 from official GitLab documentation. This records platform constraints; it does not select the MVP connection method. No account, credentials, or live private MR was accessed.

## Available approaches

| Approach | GitLab.com | Self-hosted GitLab | Practical setup |
| --- | --- | --- | --- |
| User personal access token (PAT) | Supported on every tier | Supported on every tier, subject to instance policy | User creates token on the target instance, chooses permissions and expiry, supplies it to app. Token belongs to the user. |
| Reuse `glab` through its API command | Supported | Supported, explicit hostname available | CLI must be installed and authenticated for that host; underlying credential can be PAT or OAuth. |
| App-owned OAuth authorization | Supported on every tier | Supported on every tier | Register an application on the relevant instance; user authorizes it in browser. Public desktop clients can use authorization code with PKCE without embedding a client secret. |

Sources: [PAT documentation](https://docs.gitlab.com/user/profile/personal_access_tokens/), [glab API command](https://docs.gitlab.com/cli/api/), [OAuth API](https://docs.gitlab.com/api/oauth2/).

## Permissions and posting identity

- Legacy PAT `read_api` allows API reads; `api` allows API reads and writes across projects accessible to its user. `read_repository` and `write_repository` describe repository access and do not substitute for discussion-writing API permission. OAuth exposes equivalent `read_api` and `api` scopes. These conventional write scopes are broader than permission to comment alone. [Token scopes](https://docs.gitlab.com/security/tokens/access_token_scopes/), [OAuth scopes](https://docs.gitlab.com/integration/oauth_provider/#view-all-authorized-applications).
- Authentication does not grant project membership or bypass the user's permissions. GitLab's project-role permissions govern access to the MR and commenting. Use the user's PAT or OAuth authorization when the intended posting identity is that user. Group/project tokens are separate identities, rather than substitutes for user authorization. [Roles and permissions](https://docs.gitlab.com/user/permissions/), [Token scopes](https://docs.gitlab.com/security/tokens/access_token_scopes/), [PAT documentation](https://docs.gitlab.com/user/profile/personal_access_tokens/).
- Current GitLab also supports fine-grained PATs: beta in 18.10, generally available in 19.2. They restrict resources and actions and still require the owner's permission. The current REST permission table lists Merge Request Read for discussion retrieval and Merge Request Create for creating discussions/replies. Verify every selected endpoint's resource/action permission against the supported server version; broad legacy `api` is no longer the only possible option. Administrators/owners can enforce fine-grained tokens; enforcement behavior differs between offerings. [Fine-grained PATs](https://docs.gitlab.com/auth/tokens/fine_grained_access_tokens/), [REST permission table](https://docs.gitlab.com/auth/tokens/fine_grained_access_tokens_rest/).

## Existing glab credentials

`glab api` makes authenticated API-v4 or GraphQL requests, supports explicit `--hostname`, HTTP methods, JSON input and pagination. This provides a documented way to use CLI-managed credentials without parsing or exporting their storage. That last statement is an integration inference, not a product choice. [glab API command](https://docs.gitlab.com/cli/api/).

Current login docs say credentials default to OS keyring when available, with plaintext configuration fallback; token environment variables override stored credentials. The general authentication page retains an older plaintext-only statement, so do not assume one storage format across CLI versions. [Login command](https://docs.gitlab.com/cli/auth/login/), [Authentication and precedence](https://docs.gitlab.com/cli/authentication/#token-precedence).

GitLab.com CLI browser OAuth needs no user-created application. Self-hosted CLI OAuth requires registering a non-confidential application with redirect `http://localhost:7171/auth/redirect`, supplying its client ID for that host, and the documented CLI scopes (`openid`, `profile`, `read_user`, `write_repository`, `api`). These CLI-wide scopes are distinct from the minimum needed for direct discussion API calls. [CLI authentication](https://docs.gitlab.com/cli/authentication/).

## Host, policy and lifecycle constraints

- PATs expire/revoke/rotate; self-hosted administrators can disable access tokens, and GitLab.com enterprise-group owners can disable enterprise users' PATs. Where enabled, experimental DPoP additionally requires signed headers on PAT API requests. These are availability constraints, not reasons to assume every instance behaves identically. [PAT policies and lifecycle](https://docs.gitlab.com/user/profile/personal_access_tokens/).
- OAuth application registration is attached to an instance; user/group-owned registrations exist, while instance-wide self-hosted applications require an administrator. **Inference:** a GitLab.com app registration cannot be presumed usable on an arbitrary self-hosted instance. [OAuth provider setup](https://docs.gitlab.com/integration/oauth_provider/).
- OAuth access tokens last two hours; refreshing rotates both access and refresh tokens. Use bearer headers for OAuth and the documented token header for PAT. [REST authentication](https://docs.gitlab.com/api/rest/authentication/), [OAuth refresh](https://docs.gitlab.com/api/oauth2/#authorization-code-with-proof-key-for-code-exchange-pkce).
- CLI device login explicitly requires GitLab 17.9+. The general OAuth page is internally inconsistent: flow summary says 17.1+, while device-section history says introduced 17.2 and enabled by default 17.3. Do not infer a supported product minimum from that summary; browser PKCE and device login are separate options. [CLI login](https://docs.gitlab.com/cli/auth/login/), [OAuth device flow](https://docs.gitlab.com/api/oauth2/#device-authorization-grant-flow).

## Remaining product decisions and research limits

Choose whether users must install/sign into glab, supply a token, or configure an OAuth application; whether several accounts/hosts are supported; and which server/CLI versions and organization policies the MVP promises to support. This investigation did not test private deployments, corporate certificates/proxies, SSO configurations, or runtime OAuth refresh through glab. Published documentation establishes feasibility, not tested deployment compatibility.
