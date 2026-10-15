Feature: Post review feedback safely

  Background:
    Given a current GitLab review with an open discussion

  Scenario: Posting immediately after editing sends the newest text
    Given I write a "general" draft saying "Earlier text"
    When I replace the draft with "Latest text" and immediately post it
    Then GitLab has received exactly these comments:
      | text        |
      | Latest text |
    And no local drafts remain to post

  Scenario: Retrying a partially failed batch does not resend successful comments
    Given I write a "general" draft saying "First comment"
    And I write a "general" draft saying "Second comment"
    And GitLab will reject "Second comment" once
    When I post all drafts
    Then "First comment" is sent and "Second comment" remains as a failed draft
    When I post all drafts again
    Then GitLab has received exactly these comments:
      | text           |
      | First comment  |
      | Second comment |
    And no local drafts remain to post

  Scenario Outline: An unknown posting outcome requires verification before retry
    Given I write a "general" draft saying "Uncertain comment"
    And GitLab will not confirm the next post
    When I post the draft
    Then the draft requires verification and cannot be posted again
    When I verify that the comment was "<outcome>"
    Then the verified draft is "<state>" without another posting attempt

    Examples:
      | outcome    | state          |
      | posted     | sent           |
      | not posted | ready to retry |

  Scenario: A changed posting account requires review before sending
    Given I write a "general" draft saying "Account-sensitive feedback"
    When the GitLab posting account changes
    And I post the draft
    Then posting stops and identifies the account change
    And no comment has been sent to GitLab
    When I post the draft again
    Then posting stops and identifies the account change
    And no comment has been sent to GitLab
    When I refresh the GitLab review
    And I post the draft
    Then GitLab has received exactly these comments:
      | text                       |
      | Account-sensitive feedback |
