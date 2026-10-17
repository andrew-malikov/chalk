import { ReviewDocumentBoundary } from "@canvas/documents/review-document-boundary";
import { ReviewSessionProvider } from "@canvas/host/review-session";
import { cn } from "@canvas/lib/utils";
import { ReviewDebugSettingsProvider } from "@canvas/settings/debug-settings";
import { detailHostMarker } from "@canvas/styles/markers";
import { shellStyles } from "@canvas/styles/shell-styles";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import type { PeekableAnchorRef } from "@review/documents/authoring";
import { selectSource } from "@review/documents/lens-selection";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnchorLink, ReviewPanelHost } from "./review-components";
import { ReviewProvider } from "./review-context";
import { ReviewPanelProvider } from "./review-panel";

const roots: Array<ReturnType<typeof createRoot>> = [];

describe("side-peek validation boundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}))),
    );
  });

  afterEach(async () => {
    await act(async () => {
      for (const root of roots.splice(0)) root.unmount();
    });
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens a source anchor CodePeek outside the document provider", async () => {
    const session = testReviewSession();

    const anchor: PeekableAnchorRef = {
      __kind: "db-anchor-ref",
      id: "startup",
      title: "Startup",
      peek: selectSource({
        side: "head",
        file: "src/example.ts",
        fromLine: 1,
        toLine: 3,
      }),
    };

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ReviewSessionProvider session={session}>
          <ReviewDebugSettingsProvider>
            <ReviewProvider>
              <ReviewPanelProvider>
                <ReviewDocumentBoundary revision="valid" onError={() => {}}>
                  <AnchorLink anchor={anchor}>Startup</AnchorLink>
                </ReviewDocumentBoundary>
                <div className={cn(shellStyles.detailHost, detailHostMarker)}>
                  <ReviewPanelHost />
                </div>
              </ReviewPanelProvider>
            </ReviewProvider>
          </ReviewDebugSettingsProvider>
        </ReviewSessionProvider>,
      );
      await Promise.resolve();
    });

    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="#review-anchor-startup"]',
    );

    expect(link).not.toBeNull();

    await act(async () => {
      link!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector(".side-panel section")).not.toBeNull();

    const codePeekFetches = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) =>
        String(input).includes("/code-peek/resolve"),
      );

    expect(codePeekFetches).toHaveLength(0);
  });
});
