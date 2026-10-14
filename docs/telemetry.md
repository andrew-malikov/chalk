# Telemetry

Chalk does not collect or send product telemetry. Usage tracking,
automatic error reports, crash uploads, and the PostHog transport have been
removed from the app and CLI. There is no telemetry setting or opt-out
environment variable to configure.

Local diagnostic logs and opt-in command profiling remain on your machine.
Existing telemetry files from older versions are no longer read or sent.

Agent trace capture and storage are separate product features that require
repository consent. See [Privacy](privacy.md) for their data and access rules.
