# Choose explicit posting behavior and recovery from partial failure

Parent: [GitLab integration MVP product outline](../map.md)
Type: grilling
Label: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: andrew
Blocked by: 02, 04, 05

## Question

Does the MVP post one selected draft at a time, publish a selected group, or submit a review containing all drafts? What must the user see before and after posting, and what happens when some posts succeed or the result is uncertain? Define a small, understandable behavior that preserves unsent drafts and avoids blindly duplicating posted comments. Include whether resolving discussions or editing/deleting posted comments is part of this MVP or an explicit later boundary.

## Comments

- User decision: provide a Post action on each draft and a Post all action for the review's local drafts.
- User decision: resolving discussions is in scope. Editing and deleting posted comments are later work. Reopening was not explicitly requested by this answer.
- Follow-up: define Post all behavior when some drafts are blocked, handling of confirmed versus uncertain failures, and whether Resolve is separate from posting or supports posting a reply and resolving together.
- User chose the simpler Post all contract: send everything that has not been sent. Attempt every unsent local draft, mark confirmed successes sent, and retain unsuccessful attempts as drafts. Do not introduce a product workflow for selecting only a ready subset. Exact uncertain-result handling remains a limitation to specify; there is no documented duplicate-safe retry guarantee.
- The Resolve interaction question remains unanswered: separate Resolve action, combined Post and resolve, or both. Recommendation remains a separate Resolve action that preserves unsent drafts.

## Answer

Provide Post on each draft and Post all for every unsent local draft in this review. Post all attempts every unsent draft; it is not a GitLab pending-review submission and does not publish GitLab-managed drafts. Mark a draft sent after confirmed successful creation and retain unsuccessful attempts locally. The user chose this simple behavior rather than a ready/blocked selection workflow. Posting happens on the user's explicit action; no automatic retry is part of this contract.

Provide a separate Resolve action for resolvable GitLab discussions. Resolution does not implicitly post or discard an unsent reply. The discussion remains accessible through the expandable resolved section. A combined Post and resolve action is not required. Editing and deleting posted comments are outside the first MVP.

Known limit for the subsequent specification: a timeout without an acknowledgement can leave the remote outcome uncertain. Do not promise duplicate-safe manual retries; GitLab's ordinary comment APIs do not document that guarantee. The small product outline establishes posting scope and retention, while precise uncertain-result presentation and reconciliation need the detailed specification.
