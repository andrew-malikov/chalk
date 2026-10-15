Feature: Preserve review feedback

  Background:
    Given a current GitLab review with an open discussion

  Scenario Outline: Saved drafts survive restarting storage
    When I write a "<kind>" draft saying "Keep this feedback"
    And I reopen the GitLab review after restarting storage
    Then the "<kind>" draft still says "Keep this feedback" at its original target

    Examples:
      | kind    |
      | general |
      | reply   |
      | inline  |

  Scenario: A failed autosave preserves text and prevents posting until saved
    Given draft saving is unavailable
    When I write a "general" draft saying "Do not lose this"
    And I try to post the draft
    Then the editor retains "Do not lose this" and reports an unsaved draft
    And no comment has been sent to GitLab
    When draft saving recovers and I retry saving
    Then "Do not lose this" is saved locally

  Scenario Outline: Refresh an inline draft after the code changes
    Given I write an "inline" draft saying "Check this line"
    When the merge request receives "<change>"
    And I refresh the GitLab review
    Then the inline draft is "<result>" and retains "Check this line"

    Examples:
      | change            | result                 |
      | inserted context  | moved to line 3        |
      | rewritten context | awaiting reselection   |
      | ambiguous context | awaiting reselection   |

  Scenario: Historical versions cannot modify GitLab
    Given I write a "general" draft saying "Current draft"
    When I open an older version of the GitLab review
    Then GitLab editing and posting controls are disabled
    And the API rejects these historical actions without changing feedback:
      | action  |
      | drafts  |
      | discard |
      | post    |
      | resolve |
      | recover |
      | refresh |
