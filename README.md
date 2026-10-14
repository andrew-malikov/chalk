<div align="center">
  <img
    src="docs/assets/review-logo.png"
    width="96"
    alt="Chalk logo"
  />
  <h1>Chalk</h1>
</div>

Chalk is desktop code-review app. Connects into the tools you already use - e.g. Claude Code, Codex, etc. – and gives your agent an SDK to draw on an in-app canvas to describe its work.

## Quickstart

1. [Download Chalk](https://hell.knows.where/install) and open the app.
2. Connect Claude Code, Codex, or another coding agent from the welcome screen.
3. Ask your agent to review your current branch against up-to-date main and
   open the result in Chalk.

## Guidance

Here are a few example prompts of how to use Chalk effectively. We are working hard to make sure the right choices are baked in by default to the system prompt - part of why this system is open source! - but in the meantime:

### For a new API change

> hey, this stack of commits is set up so i can get an [api] to do [objective]
>
> i'd like to see:
>
> - proposed api
> - examples
> - motivations for this (if available to you in context/in the repo)
>
> and then we can dive into implementation + explaining how things worked.

## Contributing

Contributions and feedback are welcome.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the pull request workflow,
and follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities as
described in [SECURITY.md](SECURITY.md).

## Privacy

Chalk runs against local checkouts and does not collect or send product
telemetry. Read the [privacy overview](docs/privacy.md) for local data and
optional hosted agent traces, which require repository consent.

## License

Chalk is available under the [MIT License](LICENSE). Third-party notices
for the shared runtime are in
[`packages/review/THIRD_PARTY_NOTICES.md`](packages/review/THIRD_PARTY_NOTICES.md).

## Influences

- <https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck>
  — a great overview of the constraints of modern software engineering.
- <https://maggieappleton.com/2025-08-vibe-legacy-code/> and
  <https://blog.val.town/vibe-code> — do a great job describing how AI-generated
  code fits into the pre-2025 notion of software engineering.
- Karpathy on agents:
  - On LLM agents: <https://x.com/karpathy/status/1979644538185752935>
  - On agents as "junior engineer savants":
    <https://x.com/karpathy/status/1915581920022585597>
