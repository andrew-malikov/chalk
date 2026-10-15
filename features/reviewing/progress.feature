Feature: Track viewed changes

  Background:
    Given a review with overlapping lenses and uncategorized changes

  Scenario: Viewed progress survives reopening the stored review
    When I mark the "API" lens as viewed
    And I reopen the review after restarting its storage
    Then the "API" lens is viewed
    And "api.ts" is fully viewed
    And "notes.md" is unviewed

  Scenario: Overlapping lenses share progress without counting changes twice
    When I mark the "Validation" lens as viewed
    Then the "Validation" lens is viewed
    And the "API" lens is partially viewed
    And 1 of the review's 4 changed lines is viewed
    When I mark the "API" lens as viewed
    Then the "Validation" lens is viewed
    And 3 of the review's 4 changed lines are viewed

  Scenario: Unmarking a lens preserves viewed changes outside it
    Given I mark the "API" lens as viewed
    When I mark the "Validation" lens as unviewed
    Then the "Validation" lens is unviewed
    And the "API" lens is partially viewed
    And only added lines 3 through 4 of "api.ts" remain viewed

  Scenario Outline: New pins retain marks only for unchanged file contents
    Given I mark the "API" lens as viewed
    When I open newer pins with "<change>"
    Then the "API" lens is <state>
    And "api.ts" is <file_state>

    Examples:
      | change                     | state    | file_state   |
      | unchanged file contents    | viewed   | fully viewed |
      | changed head contents      | unviewed | unviewed     |
      | changed base contents      | unviewed | unviewed     |

  Scenario: A failed save preserves progress and can be retried
    Given the next viewed save will fail
    When I mark the "API" lens as viewed
    Then a progress save error is shown
    And the "API" lens is unviewed
    And "api.ts" is unviewed
    When I mark the "API" lens as viewed
    Then the "API" lens is viewed
    And the progress save error is cleared
    And "api.ts" is fully viewed
