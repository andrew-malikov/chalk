import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "./agent-markdown";

describe("document markdown", () => {
  it("routes document source links through the supplied peek renderer, including headings and reference links", () => {
    const seen: string[] = [];

    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        source:
          "# [**Save**][source]\n\n[old](review-source:base/file.ts#L1)\n\n[source]: review-source:head/file.ts#L2\n\n[web](https://example.com) [unsafe](javascript:alert(1))",
        renderLink: (href, children) => {
          if (!href.startsWith("review-source:")) return undefined;
          seen.push(href);

          return createElement("button", { type: "button" }, children);
        },
      }),
    );

    expect(seen).toEqual([
      "review-source:head/file.ts#L2",
      "review-source:base/file.ts#L1",
    ]);
    expect(html).toContain(
      '<button type="button"><strong>Save</strong></button>',
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("javascript:");
  });

  it("does not execute raw html or unsafe markdown links", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        source:
          '<script>alert("x")</script>\n\n[run this](javascript:alert("x"))',
      }),
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("href=");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("run this");
  });

  it("keeps dollar amounts as prose", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, { source: "It costs $5 and $10." }),
    );

    expect(html).toContain("It costs $5 and $10.");
  });

  it("renders local filesystem links as non-clickable code references", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        source: [
          "[App.test.ts:49](/Users/ketanagrawal/monorepo/repos/dev/apps/review-canvas/src/App.test.ts:49)",
          "[styles.css](file:///Users/ketanagrawal/monorepo/repos/dev/apps/review-canvas/src/styles.css)",
        ].join("\n\n"),
      }),
    );

    expect(html).not.toContain("href=");
    expect(html).not.toContain("file://");
    expect(html).not.toContain("/Users/ketanagrawal");
    expect(html).toMatch(/<code[^>]*>App\.test\.ts:49<\/code>/);
    expect(html).toMatch(/<code[^>]*>styles\.css<\/code>/);
  });

  it("decodes named character references without using DOM innerHTML", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        source: "a &amp; b &gt; c",
      }),
    );

    expect(html).toContain("a &amp; b &gt; c");
  });
});
