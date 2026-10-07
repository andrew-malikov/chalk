import { ApiDocument } from "@canvas/documents/api-document";
import { TestCanvasQuery } from "@canvas/test/canvas-query-test-utils";
import {
  reviewSessionElement,
  testApiDocumentData,
  testReviewSession,
} from "@canvas/test/review-session-test-utils";
import type { Block } from "@review/review-api/document";
// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

const document: Block[] = [
  {
    id: "section",
    type: "section",
    title: "Architecture",
    children: [
      { id: "prose", type: "markdown", markdown: "Explanation" },
      { id: "map", type: "software_map", mapVersionId: "map-resource" },
    ],
  },
];

it("hides nested stored maps when disabled without dropping surrounding prose", () => {
  const data = testApiDocumentData(document);

  const render = (enabled: boolean) =>
    renderToStaticMarkup(
      <TestCanvasQuery>
        {reviewSessionElement(
          testReviewSession(),
          <ApiDocument data={data} softwareMapEnabled={enabled} />,
        )}
      </TestCanvasQuery>,
    );

  expect(render(false)).toContain("Explanation");
  expect(render(false)).not.toContain("software-map");
  expect(render(true)).toContain("software-map");
});
