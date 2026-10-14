# Gherkin acceptance tests

Status: approved on 2026-10-14; implementation pending plan review.

## Purpose

Make product behavior reviewable in complete Gherkin feature files. A reviewer
should be able to understand a behavior change by reading the scenarios, then
inspect TypeScript bindings when the execution needs attention.

The first slice covers review navigation and restoration. Existing product
behavior stays the same. Feature files become executable tests, with failures
reported under their feature and scenario names.

## Runner

Use Playwright-BDD with Playwright Test. Playwright-BDD reads standard Gherkin
and generates executable Playwright tests. Generated files stay out of Git.
Pin Playwright Test to the existing Playwright version so the acceptance suite
can use the Chromium installation already used in CI.

The current browser tests run through Vitest's Playwright provider. They provide
fixtures and useful behavior examples, but their runner cannot directly run
Playwright-BDD tests. Keep Vitest for existing tests and add one acceptance
command for the Gherkin suite.

Alternatives considered:

- Cucumber-JS with Playwright: supports the required feature files, but needs
  separate browser lifecycle and reporting integration.
- A custom Vitest adapter: could retain one runner, but would make this project
  responsible for Gherkin execution and step matching.

References: [Playwright-BDD](https://github.com/vitalets/playwright-bdd),
[custom fixtures](https://vitalets.github.io/playwright-bdd/#/writing-steps/playwright-style).

## Organization

```text
features/
  reviewing/
    navigation.feature
    resuming.feature
tests/
  acceptance/
    playwright.config.ts
    vite.config.ts
    tsconfig.json
    steps/
      navigation.steps.ts
      resuming.steps.ts
    support/
      fixtures.ts
    harness/
      index.html
      review.ts
```

Create additional files only when a scenario needs them. Feature folders describe
product capabilities. Execution tiers do not determine the catalog structure.

Write concrete scenarios in product language. Assert visible outcomes. Group
related scenarios with `Rule`. Use `Scenario Outline` for the same rule across
different values, and `Background` only for context shared by every scenario in its scope.
Keep execution details in TypeScript.

Each feature file runs as browser acceptance coverage in this slice. Add an
end-to-end execution target when a behavior needs the real host or backend.

## Browser execution

Playwright starts a Vite server bound to loopback and opens a test-only harness
that mounts the real review canvas. Reuse the source aliases and canvas styling
configuration where they apply. Keep harness modules out of desktop entry points
and build outputs.

Reuse the existing review bridge and API fixture shapes. Fixture responses supply
review versions, lenses, and commit metadata; the mounted canvas owns navigation
and persistence. Unknown fixture requests fail visibly. The harness exposes only
the setup and mount/dispose operations these scenarios need. Steps interact with
the rendered UI through accessible names and roles where available.

Use per-scenario Playwright fixtures for setup and cleanup. Each scenario gets a
fresh browser context. Reopening a review preserves storage within that scenario
and remounts the canvas. Scenario setup may provide a newer review version;
assertions must exercise the resulting UI rather than directly call a store.

This suite verifies the real canvas against fixture-backed host data. Existing
server integration tests continue to verify real storage and HTTP behavior.
Native window startup, IPC, and the packaged app remain outside this slice.

## Initial behaviors

`navigation.feature`:

```gherkin
Feature: Navigate a review

  Scenario Outline: Select an available view
    Given a review with changes and commits
    When I select the "<view>" view
    Then the "<view>" view is displayed and selected

    Examples:
      | view    |
      | Chalk   |
      | Diff    |
      | Commits |

  Scenario: Inspect one commit
    Given a review containing the commit "Add the API"
    When I open the diff for "Add the API"
    Then the Diff view is scoped to "Add the API"

  Scenario: Return to the whole diff
    Given I am viewing the diff for "Add the API"
    When I select the "Chalk" view
    And I select the "Diff" view
    Then the whole review diff is displayed
```

`resuming.feature`:

```gherkin
Feature: Resume a review

  Rule: Reopening preserves the selected view

    Scenario Outline: Reopen the last selected view
      Given I selected the "<view>" view in a review
      When I leave the review and reopen it
      Then the "<view>" view is displayed and selected

      Examples:
        | view    |
        | Chalk   |
        | Diff    |
        | Commits |

  Rule: A selected lens belongs to its review version

    Scenario: Restore a lens on the same version
      Given I selected the "API changes" lens on version 3
      When I leave the review and reopen version 3
      Then the "Diff" view is displayed and selected
      And the "API changes" lens is selected

    Scenario: Open a newer version
      Given I selected the "API changes" lens on version 3
      And version 4 is available
      When I leave the review and open version 4
      Then the "Diff" view is displayed and selected
      And no lens is selected

  Rule: A saved commit scope requires an available commit

    Scenario: Restore a commit diff
      Given I am viewing the diff for "Add the API"
      When I leave the review and reopen it
      Then the Diff view is scoped to "Add the API"

    Scenario: The saved commit is absent from the opened version
      Given I am viewing the diff for "Add the API" on version 3
      And version 4 has no commit named "Add the API"
      When I leave the review and open version 4
      Then the whole review diff is displayed
```

Reopening uses the version requested by the caller. A lens is restored only when
that version matches the version on which it was selected.

## Existing test migration

The first and fourth tests in
`apps/review-canvas/src/review/canvas-navigation.test.tsx` already cover several
of these rules with a real store and in-process HTTP routing. Preserve those
integration checks during this first slice: the new browser suite uses fixture
responses and does not replace their server coverage. Keep the tour scenarios,
store tests, and persistence validation tests.

Only remove an existing behavior test when its distinct coverage is accounted
for. Do not rewrite unrelated tests or perform product refactoring here.

## Commands and CI

- Add `bun run test:acceptance` to generate tests and run the headless suite.
- Include acceptance execution in the root test command, which CI already runs.
- Add an acceptance TypeScript check to root typechecking and include authored
  acceptance TypeScript in formatting checks.
- Ignore generated tests and reports in Git and code-quality discovery.
- Retain failure screenshots and traces, and upload them in the existing CI job.
- Fail generation or execution for invalid Gherkin, missing or ambiguous bindings,
  and failed assertions. Configure CI to reject focused tests. Do not introduce
  pending or skipped scenarios as completed acceptance coverage.

## Verification required during implementation

Run feature generation and the initial scenarios with the repository's Bun setup.
Check that a missing binding fails generation and that an incorrect expected
view fails the scenario, then revert those deliberate faults. Verify scenario
isolation by repeating the suite. Run acceptance typechecking, lint, formatting,
and the existing navigation integration tests.

The design has been checked against the existing runner, fixture helpers,
navigation tests, root scripts, and CI. Dependency installation, runtime
compatibility, and browser execution have not yet been verified.
