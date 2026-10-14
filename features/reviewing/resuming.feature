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
