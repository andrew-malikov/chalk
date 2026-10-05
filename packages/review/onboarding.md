# Blackboard workflow

1. Install Blackboard Desktop; it installs the `blackboard` CLI.
2. Open Blackboard Desktop. It hosts the JSON review server for this workflow.
3. Run `blackboard connect <agent>` and paste its prompt into the agent; the
   agent adds the Blackboard MCP server, which serves the authoring instructions.
4. Ask the agent for a review. It authors the review through the Blackboard MCP
   tools or `blackboard api`.
