# GitLab discussions panel: agreed product outline

Planning outline only; this is not an implemented interface. The user chose the discussion-panel proposal and its visibility defaults during the live discussion.

```text
GitLab discussions

Open discussion · src/example.ts:42
  Comment preview
  Opens the thread and navigates to matching local code

General MR discussion
  Comment preview
  Opens the thread without a code position

Unable to map to local code
  Comment preview
  Opens the thread; no guessed local position

▸ 23 resolved threads
  Expanding reveals resolved discussions
```

Every thread is accessible from this panel. Open discussions appear by default; resolved discussions are hidden behind their expandable count. Markers beside matching local code provide another entry point to the same threads. General and unmapped discussions remain accessible. GitLab system events are omitted; actual discussion comments, including substantive bot comments, are retained. GitLab discussions remain distinguishable from Blackboard's local Ask conversations.

Manual draft composition is settled separately: reply in a thread, start inline comments from a code selection, or start general comments from the panel. Agent assistance is outside the first MVP. Posting controls and refresh behavior remain separate open decisions.
