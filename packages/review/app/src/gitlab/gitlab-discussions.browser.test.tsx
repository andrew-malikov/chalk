import { AgentSelectionProvider } from "@canvas/ask/agent-selection";
import { PierreDiffView } from "@canvas/diff/PierreDiffView";
import { ReviewSessionProvider } from "@canvas/host/review-session";
import { ReviewDiffFilesProvider } from "@canvas/review/review-diff-files-context";
import { TestCanvasQuery } from "@canvas/test/canvas-query-test-utils";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import type {
  GitLabState,
  ReviewDiffFileWire,
} from "@dev.fast/review-protocol";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { GitLabProvider } from "./gitlab-context";
import { GitLabDiscussionContent } from "./gitlab-discussions";

it("drafts from selected Git lines and updates markers on resolve while retaining the reply", async () => {
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
    { path: "a.ts", status: "modified", additions: 1, deletions: 1 },
  ];

  const session = testReviewSession(
    {},
    {
      diffView: { files: async () => files },
      request: async (url) => {
        const source = new URL(String(url));

        if (source.searchParams.get("format") === "raw")
          return new Response(
            "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-before\n+after\n",
          );

        return Response.json(files);
      },
    },
  );

  session.review!.gitlab = state.identity;
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

    if (endpoint === "/gitlab/resolve") state.discussions[0]!.resolved = true;

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
    await vi.waitFor(() =>
      expect(container.textContent).toContain("GitLab · @andrew · Open"),
    );

    const code = [...container.querySelectorAll("diffs-container")].flatMap(
      (host) => [...host.shadowRoot!.querySelectorAll("code")],
    );

    const added = code.find(
      (node) =>
        node.hasAttribute("data-additions") &&
        node.textContent?.includes("after"),
    )!;

    await userEvent.click(
      added.querySelector<HTMLElement>(
        '[data-gutter] [data-column-number="1"]',
      )!,
    );
    await vi.waitFor(() => expect(button("GitLab comment")).toBeDefined());
    await userEvent.click(button("GitLab comment"));
    await vi.waitFor(() =>
      expect(container.querySelector("textarea")).not.toBeNull(),
    );
    const inline = container.querySelector("textarea")!;
    await userEvent.fill(inline, "Inline text");
    await vi.waitFor(() => expect(state.drafts[0]?.text).toBe("Inline text"));
    expect(state.drafts[0]?.target).toMatchObject({
      kind: "inline",
      position: {
        oldPath: "a.ts",
        newPath: "a.ts",
        side: "head",
        from: 1,
        to: 1,
      },
    });
    await userEvent.click(button("Reply"));
    const reply = [...container.querySelectorAll("textarea")].at(-1)!;
    await userEvent.fill(reply, "Keep this reply");
    await userEvent.click(button("Resolve"));
    await vi.waitFor(() =>
      expect(container.textContent).toContain("GitLab · @andrew · Resolved"),
    );
    expect(reply.value).toBe("Keep this reply");
    expect(state.drafts.find((d) => d.target.kind === "reply")?.text).toBe(
      "Keep this reply",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  }
});
