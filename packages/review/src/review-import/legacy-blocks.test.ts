import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseJsonText } from "@blackboard/review-protocol";
import {
  type ReviewNode,
  reviewDocumentDataSchema,
  upgradeReviewDocumentJson,
} from "@review/documents/review-document-data";
import {
  LEGACY_REVIEW_FIXTURES_ROOT,
  listLegacyReviewFixtures,
} from "@review/fixtures/legacy-reviews/legacy-review-fixture";
import {
  blockSchema,
  checkReferences,
  elements,
  resourceReferences,
} from "@review/review-api/document";
import { describe, expect, it } from "vitest";

import { el, text } from "./import-test-utils";
import { legacyDocumentToBlocks } from "./legacy-blocks";

/** A sealed document whose body is `body`, for the nesting cases no fixture has. */
const documentOf = (body: ReviewNode[]) =>
  reviewDocumentDataSchema.parse({
    format: "review-document/1",
    title: "T",
    routePath: "/",
    sourcePath: "review.mdx",
    anchors: {},
    anchorContents: {},
    softwareModels: [],
    body,
  });

const sequence = (title: string): ReviewNode => ({
  type: "component",
  name: "SequenceDiagram",
  props: {
    id: title,
    title,
    actors: { caller: "Caller", callee: "Callee" },
    steps: [
      {
        type: "step",
        style: "call",
        from: "caller",
        to: "callee",
        label: "call",
        explanation: "why",
      },
    ],
  },
  children: [],
});

const image = (src: string, alt?: string): ReviewNode =>
  el("img", [], alt === undefined ? { src } : { src, alt });

const load = async (name: string) =>
  reviewDocumentDataSchema.parse(
    upgradeReviewDocumentJson(
      parseJsonText(
        await readFile(
          path.join(
            LEGACY_REVIEW_FIXTURES_ROOT,
            `${name}.expected-document.json`,
          ),
          "utf8",
        ),
      ),
    ),
  );

describe("legacyDocumentToBlocks", () => {
  it("maps sections, prose, links and diagrams", async () => {
    const { blocks, warnings } = legacyDocumentToBlocks(
      await load("schema4-opencode-agentserver"),
    );

    expect(warnings).toEqual([]);
    expect(blocks[0]?.type).toBe("markdown");
    expect(
      blocks[0]?.type === "markdown" && blocks[0].markdown.startsWith("# "),
    ).toBe(true);
    expect(blocks.filter((block) => block.type === "section")).toHaveLength(4);
    expect(JSON.stringify(blocks)).toContain('"type":"sequence"');
    expect(JSON.stringify(blocks)).toContain("review-source:head/");

    for (const block of blocks) blockSchema.parse(block);
    checkReferences(blocks);
  });

  it("never emits element ids", async () => {
    const stray: string[] = [];

    for (const { name } of listLegacyReviewFixtures())
      for (const element of elements(
        legacyDocumentToBlocks(await load(name)).blocks,
      )) {
        if (element.id !== undefined) stray.push(`${name}:${element.type}`);

        if (element.type === "call_stack_diff")
          for (const frame of [...element.base, ...element.head])
            if (frame.id !== undefined) stray.push(`${name}:frame`);

        if (element.type === "database_lens")
          for (const useCase of element.useCases) {
            if (useCase.id !== undefined) stray.push(`${name}:case`);

            for (const operation of useCase.operations)
              if (operation.id !== undefined) stray.push(`${name}:operation`);
          }
      }

    expect(stray).toEqual([]);
  });

  it.each([
    {
      container: "a paragraph, in order",
      nodes: [
        el("p", [
          text("Two flows:"),
          sequence("First flow"),
          text(" and"),
          sequence("Second flow"),
        ]),
        el("p", [text("After.")]),
      ],
      blocks: [
        { type: "markdown", markdown: "Two flows: and\n" },
        expect.objectContaining({ type: "sequence", title: "First flow" }),
        expect.objectContaining({ type: "sequence", title: "Second flow" }),
        { type: "markdown", markdown: "After.\n" },
      ],
    },
    {
      container: "a list item",
      nodes: [el("ul", [el("li", [sequence("Flow")])])],
      blocks: [
        { type: "markdown", markdown: "-\n" },
        expect.objectContaining({ type: "sequence", title: "Flow" }),
      ],
    },
    {
      container: "a blockquote",
      nodes: [el("blockquote", [el("p", [text("Quoted.")]), sequence("Flow")])],
      blocks: [
        { type: "markdown", markdown: "> Quoted.\n" },
        expect.objectContaining({ type: "sequence", title: "Flow" }),
      ],
    },
  ])("hoists diagrams out of $container", ({ nodes, blocks }) => {
    expect(legacyDocumentToBlocks(documentOf(nodes))).toMatchObject({
      blocks,
      warnings: [],
    });
  });

  it("hoists relative images out of prose as image blocks", () => {
    const { blocks, images, warnings } = legacyDocumentToBlocks(
      documentOf([
        el("p", [
          text("Shots: "),
          image("./shots/flow.png", "The flow"),
          image("shots/empty.png"),
        ]),
        el("p", [text("After.")]),
      ]),
    );

    expect(blocks).toEqual([
      { type: "markdown", markdown: "Shots:\n" },
      { type: "image", assetId: "image-placeholder-1", alt: "The flow" },
      { type: "image", assetId: "image-placeholder-2", alt: "empty.png" },
      { type: "markdown", markdown: "After.\n" },
    ]);
    expect(images).toEqual([
      {
        src: "./shots/flow.png",
        alt: "The flow",
        placeholder: "image-placeholder-1",
      },
      {
        src: "shots/empty.png",
        alt: "empty.png",
        placeholder: "image-placeholder-2",
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("leaves a remote image in the Markdown", () => {
    const { blocks, images } = legacyDocumentToBlocks(
      documentOf([el("p", [image("https://img.example/a.png", "Remote")])]),
    );

    expect(blocks).toEqual([
      { type: "markdown", markdown: "![Remote](https://img.example/a.png)\n" },
    ]);
    expect(images).toEqual([]);
  });
});
