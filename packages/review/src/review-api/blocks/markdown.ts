import { markdownNodes, parseMarkdown } from "@review/documents/markdown.js";
import { sourcePinsSchema } from "@review/documents/source.js";
import { UnsupportedReviewContentError } from "@review/review-api/input-error.js";

import { defineBlock, text } from "./definition.js";

export const markdown = {
  type: "markdown",
  check: (block: { markdown: string }) =>
    assertNoRetiredTraceLinks(block.markdown),
  schema: defineBlock("markdown", {
    markdown: text.describe(
      "Safe Markdown. Repository file links must use [label](review-source:head/path#L10-L24) or review-source:base/path#L10-L24, with a repository-relative path and verified line numbers. Relative paths, absolute filesystem paths, and file/editor URLs are rejected. External links use https://, http://, or mailto:; document anchors use #heading.",
    ),
    pins: sourcePinsSchema
      .optional()
      .describe(
        "Repository and commits this block's review-source links resolve against, instead of the document's pins.",
      ),
  }),
} as const;

export function assertNoRetiredTraceLinks(markdown: string): void {
  for (const node of markdownNodes(parseMarkdown(markdown)))
    if (node.type === "link" && /^review-trace:/i.test(node.url ?? ""))
      throw new UnsupportedReviewContentError();
}
