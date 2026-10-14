import "@canvas/global.css";
import "@canvas/ui.css";
import type {
  GitLabState,
  ReviewDiffFileWire,
} from "@blackboard/review-contracts";
import { AgentSelectionProvider } from "@canvas/agent-context/agent-selection";
import { PierreDiffView } from "@canvas/diff/PierreDiffView";
import { ReviewSessionProvider } from "@canvas/host/review-session";
import { ReviewDiffFilesProvider } from "@canvas/review/review-diff-files-context";
import { TestCanvasQuery } from "@canvas/test/canvas-query-test-utils";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { GitLabProvider } from "./gitlab-context";
import { GitLabDiscussionContent } from "./gitlab-discussions";

it("V10: drafts from hovered/selected Git lines and resolves with stable loading feedback while retaining the reply", async () => {
  const state: GitLabState = {
    identity: {
      host: "gitlab.test",
      url: "https://gitlab.test/a/b/-/merge_requests/1",
      projectId: 1,
      projectPath: "a/b",
      iid: 1,
      cloneUrl: "https://gitlab.test/a/b.git",
    },
    account: { id: 7, username: "andrew", name: "Andrew" },
    refs: {
      baseSha: "a".repeat(40),
      startSha: "a".repeat(40),
      headSha: "b".repeat(40),
    },
    discussions: [
      {
        id: "thread",
        resolvable: true,
        resolved: false,
        location: { file: "a.ts", side: "head", from: 1, to: 1 },
        comments: [
          {
            id: 1,
            body: "Check cancellation",
            author: { id: 7, username: "andrew", name: "Andrew" },
            createdAt: "2026-10-07T10:00:00Z",
          },
        ],
      },
    ],
    drafts: [],
  };

  const files: ReviewDiffFileWire[] = [
    { path: "a.ts", status: "modified", additions: 2, deletions: 2 },
  ];

  const session = testReviewSession(
    {},
    {
      diffView: { files: async () => files },
      request: async (url) => {
        const source = new URL(String(url));

        if (source.searchParams.get("format") === "raw")
          return new Response(
            "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-before\n-before second\n+after\n+after second\n",
          );

        return Response.json(files);
      },
    },
  );

  session.review!.gitlab = state.identity;
  const resolveRequest = Promise.withResolvers<void>();
  let resolveCalls = 0;
  session.fetch = async (endpoint, init) => {
    const input = init?.body ? JSON.parse(String(init.body)) : {};

    if (endpoint === "/gitlab/drafts") {
      const draft = {
        ...input,
        status: "saved",
        version:
          (state.drafts.find((d) => d.id === input.id)?.version ?? 0) + 1,
      };

      state.drafts = state.drafts.filter((d) => d.id !== input.id);
      state.drafts.push(draft);

      return Response.json(draft);
    }

    if (endpoint === "/gitlab/resolve") {
      resolveCalls++;
      await resolveRequest.promise;
      state.discussions[0]!.resolved = true;
    }

    if (endpoint === "/gitlab/discard")
      state.drafts = state.drafts.filter((d) => d.id !== input.id);

    return Response.json(state);
  };

  const container = document.createElement("div");
  container.className = "review-canvas-root review-document";
  container.style.cssText = "height:600px;width:1100px;display:flex";
  document.body.append(container);
  const root = createRoot(container);

  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    )!;

  try {
    await act(async () =>
      root.render(
        <TestCanvasQuery>
          <ReviewSessionProvider session={session}>
            <GitLabProvider>
              <AgentSelectionProvider revision="one">
                <ReviewDiffFilesProvider documentKey="one">
                  <div style={{ width: 650, height: 600 }}>
                    <PierreDiffView inWorkspace />
                  </div>
                  <div style={{ width: 450, height: 600, overflow: "auto" }}>
                    <GitLabDiscussionContent />
                  </div>
                </ReviewDiffFilesProvider>
              </AgentSelectionProvider>
            </GitLabProvider>
          </ReviewSessionProvider>
        </TestCanvasQuery>,
      ),
    );

    const thread = () =>
      container.querySelector<HTMLElement>(
        '[aria-label="GitLab discussion thread"]',
      )!;

    await vi.waitFor(() =>
      expect(thread()?.textContent).toContain("Check cancellation"),
    );

    const code = [...container.querySelectorAll("diffs-container")].flatMap(
      (host) => [...host.shadowRoot!.querySelectorAll("code")],
    );

    const added = code.find(
      (node) =>
        node.hasAttribute("data-additions") &&
        node.textContent?.includes("after"),
    )!;

    // The hover utility must target the actual diff side, including deleted lines.
    for (const side of ["head", "base"] as const) {
      const column = code.find((node) =>
        node.hasAttribute(
          side === "head" ? "data-additions" : "data-deletions",
        ),
      )!;

      await userEvent.hover(column.querySelector<HTMLElement>("[data-line]")!);
      await userEvent.click(
        container.querySelector<HTMLButtonElement>(
          '[aria-label="Add comment in a.ts"]',
        )!,
      );

      const hovered = () =>
        container.querySelector<HTMLTextAreaElement>(
          '[aria-label^="GitLab draft"] textarea',
        );

      await vi.waitFor(() => expect(hovered()).not.toBeNull());
      await userEvent.fill(hovered()!, `Hovered ${side}`);
      await vi.waitFor(() =>
        expect(state.drafts[0]?.target).toMatchObject({
          kind: "inline",
          position: { oldPath: "a.ts", newPath: "a.ts", side, from: 1, to: 1 },
        }),
      );
      await userEvent.click(
        container
          .querySelector<HTMLElement>('[aria-label^="GitLab draft"]')!
          .querySelectorAll("button")[1]!,
      );
      await vi.waitFor(() => expect(hovered()).toBeNull());
    }

    await userEvent.click(
      added.querySelector<HTMLElement>(
        '[data-gutter] [data-column-number="1"]',
      )!,
    );
    await userEvent.keyboard("{Shift>}");
    await userEvent.click(
      added.querySelector<HTMLElement>(
        '[data-gutter] [data-column-number="2"]',
      )!,
    );
    await userEvent.keyboard("{/Shift}");
    await vi.waitFor(() => expect(button("GitLab comment")).toBeDefined());
    await userEvent.click(button("GitLab comment"));
    await vi.waitFor(() =>
      expect(
        container.querySelector('[aria-label^="GitLab draft"] textarea'),
      ).not.toBeNull(),
    );

    const inline = container.querySelector<HTMLTextAreaElement>(
      '[aria-label^="GitLab draft"] textarea',
    )!;

    expect(document.activeElement).toBe(inline);
    await userEvent.fill(inline, "Inline text");
    await vi.waitFor(() => expect(state.drafts[0]?.text).toBe("Inline text"));
    expect(
      container.querySelector('[aria-label^="GitLab draft"] textarea'),
    ).toBe(inline);
    expect(document.activeElement).toBe(inline);
    expect(state.drafts[0]?.target).toMatchObject({
      kind: "inline",
      position: {
        oldPath: "a.ts",
        newPath: "a.ts",
        side: "head",
        from: 1,
        to: 2,
      },
    });

    const threadButton = (label: string) =>
      [...thread().querySelectorAll("button")].find(
        (b) => b.textContent === label,
      )!;

    await userEvent.click(threadButton("Reply"));
    const reply = thread().querySelector("textarea")!;
    await userEvent.fill(reply, "Keep this reply");
    const resolveButton = threadButton("Resolve");
    const resolveWidth = resolveButton.getBoundingClientRect().width;
    await userEvent.click(threadButton("Resolve"));
    await vi.waitFor(() =>
      expect(resolveButton.getAttribute("aria-busy")).toBe("true"),
    );
    expect(resolveButton.disabled).toBe(true);
    expect(resolveButton.getBoundingClientRect().width).toBe(resolveWidth);
    expect(threadButton("Reply").hasAttribute("aria-busy")).toBe(false);
    expect(reply.value).toBe("Keep this reply");
    expect(resolveCalls).toBe(1);
    resolveRequest.resolve();
    await vi.waitFor(() =>
      expect(thread().querySelector("summary")?.textContent).toContain(
        "Resolved",
      ),
    );
    expect(reply.value).toBe("Keep this reply");
    expect(state.drafts.find((d) => d.target.kind === "reply")?.text).toBe(
      "Keep this reply",
    );
  } finally {
    resolveRequest.resolve();
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  }
});
