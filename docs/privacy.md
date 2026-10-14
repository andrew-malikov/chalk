# Privacy

Chalk reads source code and agent-authored documents from your machine.
This page describes local product data and the optional hosted trace store.

## What stays local

Chalk stores authored chalks in `~/.dev/review-api.db` and desktop
discovery under `~/.dev/review-desktop/`. The native desktop uses
`~/.dev-fast/review-electrobun` as its default profile; `DEV_REVIEW_HOME`
selects another profile. These names predate the Chalk rename.

The canvas talks to Chalk's local server. Chalk does not collect or
send product usage telemetry, automatic error reports, or crash dumps.
Existing telemetry files from older versions are no longer read or sent.

Diagnostic logs remain local. Command profiling is off by default; setting
`CHALK_REVIEW_TRACE` or `CHALK_REVIEW_TRACE_DIR` writes profiling data to
local files. These files can contain command arguments, paths, and error
messages. Chalk does not upload them.

## Hosted trace store

Hosted tracing requires explicit consent for each repository and origin.
Before setup, explain transcript contents, destination, and access rules below.
Without consent, capture stays off. S3 `autoActivateRepositories` never grants
hosted consent.

Trace capture is off by default. Hosted uploads start when this machine's
selected store is the hosted store and the repository is allowed. Selection
happens explicitly with `chalk trace storage use hosted`, or implicitly when
a machine that has no bucket configured allows a repository with
`chalk trace allow`. After that, complete agent session transcripts for the
allowed repositories are uploaded to the Chalk hosted store at the origin
you logged in to. One conversation can contain work from several
repositories; Chalk publishes a session automatically only when its captured
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
`chalk trace deny` removes this machine's consent for the repository and keeps
prior uploads. `chalk trace store delete` asks the store to delete the
repository's hosted copies (admins only) and leaves the consent as it is.

Objects are encrypted with server-controlled keys, so Chalk can decrypt
stored traces. The GitHub OAuth app requests the `repo` scope to check access.
S3/R2 bucket storage sends nothing to Chalk.
