---
name: blackboard
description: "Explain code in Blackboard, the architecture-visualization tool: author Blackboards of branches, changes and GitLab merge requests, draw on the Blackboard scratchpad, or research why code exists from past agent sessions."
---

# dev.fast Blackboard

If `mcp__blackboard__*` tools are available, use them instead of this skill.

Blackboard serves its own instructions. Before authoring, run `blackboard api session_get_instructions '{}'` and follow the result. Pass `'{"topic":"scratchpad"}'` to explain code visually. If Blackboard is not running, the response says how to start it.
