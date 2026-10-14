# Chalk workflow

1. Install Chalk Desktop; it installs the `chalk` CLI.
2. Open Chalk Desktop. It hosts the JSON review server for this workflow.
3. Run `chalk connect <agent>` and paste its prompt into the agent; the
   agent adds the Chalk MCP server, which serves the authoring instructions.
4. Ask the agent for a review. It authors the review through the Chalk MCP
   tools or `chalk api`.
