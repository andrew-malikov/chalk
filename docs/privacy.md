# Privacy

<!--
Outline: Local data -> Anonymous telemetry -> Errors
-> Hosted trace store -> Opt-out -> Developer inspection.
-->

Blackboard reads source code and agent-authored documents from your machine.
This page separates the local product data, anonymous telemetry, error
reports, and hosted traces.

Read the [dev.fast privacy policy](https://dev.fast/privacy) for the public
policy governing Blackboard.

For the exact event schemas and implementation references, see the full
[telemetry reference](telemetry.md).

## What stays local

Blackboard stores authored blackboards in `~/.dev/review-api.db` and desktop
discovery under `~/.dev/review-desktop/`. The native desktop uses
`~/.dev-fast/review-electrobun` as its default profile; `DEV_REVIEW_HOME`
selects another profile. These names predate the
Blackboard rename.

Passive product telemetry never includes:

- source code or changed-file diffs;
- paths, repository names, blackboard titles, refs, revision hashes, symbols,
  or declarations;
- blackboard document text;
- prompts or model output; or
- email, username, hostname, machine identifier, blackboard ID, or coding-agent
  session identifier.

The canvas talks to Blackboard's local server. It does not connect directly to
PostHog.

## Anonymous product telemetry

Anonymous telemetry is enabled by default. Blackboard creates a random
installation UUID per release channel, with no PostHog person profile.
See [Identity and storage](telemetry.md#identity-and-storage).

Telemetry can include closed enums, booleans, counts, durations, the CLI and
app versions, release channel, operating-system version and architecture
categories, feature usage, opaque lifecycle-correlation identifiers, and
sanitized product errors. Blackboard derives blackboard and presentation
correlation IDs locally with a namespaced HMAC keyed by the random
installation ID; raw blackboard IDs never reach PostHog. PostHog may derive
coarse location at ingestion, but the project discards the source IP.

Pending events are stored in a bounded local queue under
`~/.dev/telemetry/events` by default. Blackboard retries temporary
delivery failures and removes pending events after seven days.

## Error reports

Blackboard can automatically report failures in its own app, canvas, server,
or background process. These reports may contain an error class, a cleaned
message, a one-way fingerprint, and up to ten stack frames from Blackboard's
shipped program. A repeating error is reported at most five times per session.

When a Blackboard process crashes, Blackboard records which process died and
its exit code. Older Electron builds also wrote local crash dumps, which can contain
process memory, including open source text. The next launch uploads it to the
bug-report service, which keeps it for 30 days, and deletes the local copy.
With telemetry off, dumps are deleted without upload.

Update telemetry records when an update is staged, when that exact target next
launches, or when checking, downloading, or installing fails. For a macOS
install failure, Blackboard reads only log bytes appended after that update was
staged, extracts one concise ShipIt error summary, and passes it through the
same local cleaner. The raw ShipIt log is never stored in telemetry or sent.

Before sending, Blackboard cleans paths, home and temporary directories, web
addresses, email addresses, and known secret formats. It drops repository,
dependency, and extension stack frames. It also drops any message that quotes a
blackboard document or does not pass a second local path-and-secret check.

## Hosted trace store

Hosted tracing requires explicit consent for each repository and origin.
Before setup, explain transcript contents, destination, and access rules below.
Without consent, capture stays off. S3 `autoActivateRepositories` never grants
hosted consent.

Trace capture is off by default. Hosted uploads start when this machine's
selected store is the hosted store and the repository is allowed. Selection
happens explicitly with `blackboard trace storage use hosted`, or implicitly when
a machine that has no bucket configured allows a repository with
`blackboard trace allow`. After that, complete agent session transcripts for the
allowed repositories are uploaded to the /dev/fast hosted store at the origin
you logged in to. One conversation can contain work from several
repositories; Blackboard publishes a session automatically only when its captured
provenance places it in the allowed repository, and a commit trailer alone
never authorizes an upload. Transcripts can contain prompts, model output,
source code, file paths, URLs, and email addresses. Each publication also
records the checkout branch and the Git author name at that time.

Only GitHub users with current push access or higher to the repository can
discover or read its traces, for public and private repositories alike.
Read-only collaborators, former contributors, and the public cannot. Making a
repository public does not widen access. Deleting a store is admin-only and is
a logical deletion followed by operator cleanup; issued download links and
retained object versions expire on a bounded schedule rather than instantly.
`blackboard trace deny` removes this machine's consent for the repository and keeps
prior uploads. `blackboard trace store delete` asks the store to delete the
repository's hosted copies (admins only) and leaves the consent as it is.

Objects are encrypted with server-controlled keys, so /dev/fast can decrypt
stored traces. The GitHub OAuth app requests the `repo` scope to check access.
S3/R2 bucket storage sends nothing to /dev/fast.

## Turn telemetry off

In Blackboard, open **Preferences → Settings** and disable **Share anonymous
usage data**. That setting controls both the app and CLI on the same
installation.

For a process or headless environment, set a supported opt-out variable:

```sh
DO_NOT_TRACK=1 blackboard info
```

`DNT=1` and the other variables listed in the
[telemetry reference](telemetry.md#turn-telemetry-off) are also supported.

## Inspect events during development

Set the debug sink before launching Blackboard:

```sh
DEV_FAST_REVIEW_TELEMETRY_DEBUG=1 blackboard app launch
```

Blackboard prints each event to stderr instead of sending it to PostHog. See
[Inspect events during development](telemetry.md#inspect-events-during-development)
for its exact behavior.
