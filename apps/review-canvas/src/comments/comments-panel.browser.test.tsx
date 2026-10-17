import "@canvas/global.css";
import "@canvas/ui.css";
import { AgentSelectionProvider } from "@canvas/agent-context/agent-selection";
import { PierreDiffView } from "@canvas/diff/PierreDiffView";
import { ReviewSessionProvider } from "@canvas/host/review-session";
import { ReviewDiffFilesProvider } from "@canvas/review/review-diff-files-context";
import { TestCanvasQuery } from "@canvas/test/canvas-query-test-utils";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import type {
  CommentsState,
  GitLabState,
  ReviewDiffFileWire,
} from "@chalk/review-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { CommentsProvider } from "./comments-context";
import { CommentsContent } from "./comments-panel";

it("V10: drafts from hovered/selected Git lines and resolves with stable loading feedback while retaining the reply", async () => {
  const gitlab: GitLabState = {
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
  };

  const state: CommentsState = { comments: [], gitlab };

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

  const resolveRequest = Promise.withResolvers<void>();
  let resolveCalls = 0;
  session.fetch = async (endpoint, init) => {
    const input = init?.body ? JSON.parse(String(init.body)) : {};

    if (endpoint === "/comments/save") {
      const draft = {
        ...input,
        author: "user",
        status: "saved",
        version:
          (state.comments.find((d) => d.id === input.id)?.version ?? 0) + 1,
      };

      state.comments = state.comments.filter((d) => d.id !== input.id);
      state.comments.push(draft);

      return Response.json(draft);
    }

    if (endpoint === "/gitlab/resolve") {
      resolveCalls++;
      await resolveRequest.promise;
      gitlab.discussions[0]!.resolved = true;
    }

    if (endpoint === "/comments/discard")
      state.comments = state.comments.filter((d) => d.id !== input.id);

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
            <CommentsProvider>
              <AgentSelectionProvider revision="one">
                <ReviewDiffFilesProvider documentKey="one">
                  <div style={{ width: 650, height: 600 }}>
                    <PierreDiffView inWorkspace />
                  </div>
                  <div style={{ width: 450, height: 600, overflow: "auto" }}>
                    <CommentsContent />
                  </div>
                </ReviewDiffFilesProvider>
              </AgentSelectionProvider>
            </CommentsProvider>
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

    const comment = () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Comment"]');

    const selectLines = async (column: Element, from: number, to = from) => {
      const line = (n: number) =>
        column.querySelector(`[data-line="${n}"][data-line-type]`)!;

      const range = document.createRange();
      range.setStart(line(from), 0);
      range.setEnd(line(to), line(to).childNodes.length);
      await act(async () => {
        document.getSelection()!.removeAllRanges();
        document.getSelection()!.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
      });
    };

    // A selected line must target the actual diff side, including deleted lines.
    for (const side of ["head", "base"] as const) {
      const column = code.find((node) =>
        node.hasAttribute(
          side === "head" ? "data-additions" : "data-deletions",
        ),
      )!;

      await selectLines(column, 1);
      await vi.waitFor(() => expect(comment()).not.toBeNull());
      await userEvent.click(comment()!);

      const hovered = () =>
        container.querySelector<HTMLElement>(
          '[aria-label^="Comment "] [role="textbox"]',
        );

      await vi.waitFor(() => expect(hovered()).not.toBeNull());
      await userEvent.fill(hovered()!, `Hovered ${side}`);
      await vi.waitFor(() =>
        expect(state.comments[0]?.target).toMatchObject({
          kind: "inline",
          position: { oldPath: "a.ts", newPath: "a.ts", side, from: 1, to: 1 },
        }),
      );
      await userEvent.click(
        [
          ...container
            .querySelector<HTMLElement>('[aria-label^="Comment "]')!
            .querySelectorAll("button"),
        ].find((b) => b.textContent === "Discard")!,
      );
      await vi.waitFor(() => expect(hovered()).toBeNull());
    }

    await selectLines(added, 1, 2);
    await vi.waitFor(() => expect(comment()).not.toBeNull());
    await userEvent.click(comment()!);
    await vi.waitFor(() =>
      expect(
        container.querySelector('[aria-label^="Comment "] [role="textbox"]'),
      ).not.toBeNull(),
    );

    const inline = container.querySelector<HTMLElement>(
      '[aria-label^="Comment "] [role="textbox"]',
    )!;

    expect(document.activeElement).toBe(inline);
    await userEvent.fill(inline, "Inline text");
    await vi.waitFor(() => expect(state.comments[0]?.text).toBe("Inline text"));
    expect(
      container.querySelector('[aria-label^="Comment "] [role="textbox"]'),
    ).toBe(inline);
    expect(document.activeElement).toBe(inline);
    expect(state.comments[0]?.target).toMatchObject({
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
    const reply = thread().querySelector<HTMLElement>('[role="textbox"]')!;
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
    expect(reply.textContent).toBe("Keep this reply");
    expect(resolveCalls).toBe(1);
    resolveRequest.resolve();
    await vi.waitFor(() => expect(thread().textContent).toContain("Resolved"));
    expect(reply.textContent).toBe("Keep this reply");
    expect(state.comments.find((d) => d.target.kind === "reply")?.text).toBe(
      "Keep this reply",
    );
  } finally {
    resolveRequest.resolve();
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  }
});

it("stacks collapsed discussions as chips on their line that take no diff height", async () => {
  const gitlab: GitLabState = {
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
        resolved: true,
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
      {
        id: "other",
        resolvable: true,
        resolved: true,
        location: { file: "a.ts", side: "head", from: 1, to: 1 },
        comments: [
          {
            id: 2,
            body: "Looks fine",
            author: { id: 8, username: "markup", name: "Markup" },
            createdAt: "2026-10-07T10:00:00Z",
          },
        ],
      },
    ],
  };

  const state: CommentsState = { comments: [], gitlab };

  const files: ReviewDiffFileWire[] = [
    { path: "a.ts", status: "modified", additions: 2, deletions: 2 },
  ];

  const session = testReviewSession(
    {},
    {
      diffView: { files: async () => files },
      request: async (url) =>
        new URL(String(url)).searchParams.get("format") === "raw"
          ? new Response(
              "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-before\n-before second\n+after\n+after second\n",
            )
          : Response.json(files),
    },
  );

  session.fetch = async () => Response.json(state);

  const container = document.createElement("div");
  container.className = "review-canvas-root review-document";
  container.style.cssText = "height:600px;width:900px;display:flex";
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () =>
      root.render(
        <TestCanvasQuery>
          <ReviewSessionProvider session={session}>
            <CommentsProvider>
              <AgentSelectionProvider revision="one">
                <ReviewDiffFilesProvider documentKey="one">
                  <div style={{ width: 900, height: 600 }}>
                    <PierreDiffView inWorkspace />
                  </div>
                </ReviewDiffFilesProvider>
              </AgentSelectionProvider>
            </CommentsProvider>
          </ReviewSessionProvider>
        </TestCanvasQuery>,
      ),
    );

    const chip = (author = "andrew") =>
      container.querySelector<HTMLElement>(
        `[aria-label="Expand resolved discussion by @${author}"]`,
      );

    const line = (n: number) =>
      [...container.querySelectorAll("diffs-container")]
        .flatMap((host) => [
          ...host.shadowRoot!.querySelectorAll<HTMLElement>(
            `[data-additions] [data-line="${n}"]`,
          ),
        ])
        .find((node) => node.hasAttribute("data-line-type"))!;

    await vi.waitFor(() => expect(chip()).not.toBeNull());
    expect(chip("markup")).not.toBeNull();
    // A stack has no room for author names.
    expect(container.textContent).not.toContain("@andrew");
    expect(container.textContent).not.toContain("Check cancellation");

    const row = line(1).getBoundingClientRect();

    const onLine = (author: string) => {
      const mark = chip(author)!.getBoundingClientRect();
      expect(mark.top).toBeGreaterThanOrEqual(row.top);
      expect(mark.bottom).toBeLessThanOrEqual(row.bottom);
    };

    onLine("andrew");
    onLine("markup");
    expect(line(2).getBoundingClientRect().top).toBe(row.bottom);

    await userEvent.click(chip()!);
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Check cancellation"),
    );
    expect(line(2).getBoundingClientRect().top).toBeGreaterThan(row.bottom);
    // The remaining chip stays on the line, above the expanded thread.
    onLine("markup");
    expect(container.textContent).toContain("@markup");

    await userEvent.click(
      container.querySelector<HTMLElement>(
        '[aria-label="Collapse discussion"]',
      )!,
    );
    await vi.waitFor(() => expect(chip()).not.toBeNull());
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  }
});

it("collapses a sidebar discussion to a one-line summary and expands it back", async () => {
  const gitlab: GitLabState = {
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
        comments: [
          {
            id: 1,
            body: "Can we rework it?",
            author: { id: 8, username: "markup", name: "Markup" },
            createdAt: "2026-10-07T10:00:00Z",
          },
          {
            id: 2,
            body: "Sure thing",
            author: { id: 7, username: "andrew", name: "Andrew" },
            createdAt: "2026-10-07T11:00:00Z",
          },
        ],
      },
    ],
  };

  const state: CommentsState = { comments: [], gitlab };

  const session = testReviewSession();
  session.fetch = async () => Response.json(state);

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    );

  try {
    await act(async () =>
      root.render(
        <TestCanvasQuery>
          <ReviewSessionProvider session={session}>
            <CommentsProvider>
              <CommentsContent />
            </CommentsProvider>
          </ReviewSessionProvider>
        </TestCanvasQuery>,
      ),
    );

    const collapse = () =>
      container.querySelector<HTMLElement>(
        '[aria-label="Collapse discussion"]',
      );
    await vi.waitFor(() => expect(collapse()).not.toBeNull());
    expect(container.textContent).toContain("Sure thing");

    await userEvent.click(collapse()!);
    await vi.waitFor(() => expect(button("Expand")).toBeDefined());
    expect(container.textContent).toContain("Can we rework it?");
    expect(container.textContent).not.toContain("Sure thing");
    expect(button("Reply")).toBeUndefined();

    await userEvent.click(button("Expand")!);
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Sure thing"),
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  }
});
