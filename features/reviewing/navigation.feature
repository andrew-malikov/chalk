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
