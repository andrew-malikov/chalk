Feature: Focus a review with lenses

  Background:
    Given a review with overlapping lenses and uncategorized changes

  Scenario: Select and clear a lens
    When I select the "API" lens
    And I close and reopen diff navigation
    Then only "api.ts" is listed in the diff
    When I clear the selected lens
    Then "api.ts" and "notes.md" are listed in the diff

  Scenario: Find changes outside authored lenses
    When I select the "Uncategorized changes" lens
    Then only "notes.md" is listed in the diff
    And the lens contains only the added line 1 of "notes.md"

  Scenario: A lens without matching files is unavailable
    Then the "Missing files" lens cannot be selected
    And the whole review diff is displayed
