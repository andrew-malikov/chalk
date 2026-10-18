import { ReviewSessionProvider } from "@canvas/host/review-session";
import { ReviewPanelProvider } from "@canvas/review/review-panel";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import type { CommentsState } from "@chalk/review-contracts";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { CommentsProvider } from "./comments-context";
import { CommentsPanel } from "./comments-panel";

it("keeps unsaved text after an autosave failure and flushes the latest edit before explicit posting", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no layout; the comment editor scrolls its selection into view.
  Range.prototype.getClientRects = () =>
    document.createElement("span").getClientRects();
  Range.prototype.getBoundingClientRect = () => new DOMRect();

  const state: CommentsState = {
    comments: [],
    gitlab: {
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
      discussions: [],
    },
  };

  const session = testReviewSession();
  const calls: string[] = [];
  let rejectSave = true;
  let postedText: string | undefined;
  session.fetch = async (endpoint, init) => {
    calls.push(endpoint);
    const input = init?.body ? JSON.parse(String(init.body)) : {};

    if (endpoint === "/comments/save") {
      if (rejectSave)
        return Response.json({ error: "Disk unavailable" }, { status: 409 });
      const previous = state.comments.find((d) => d.id === input.id);

      const draft = {
        ...input,
        author: "user",
        status: "saved",
        version: (previous?.version ?? 0) + 1,
      };

      state.comments = state.comments.filter((d) => d.id !== input.id);
      state.comments.push(draft);

      return Response.json(draft);
    }

    if (endpoint === "/gitlab/post") {
      postedText = state.comments[0]?.text;
      state.comments[0]!.status = "sent";
      state.comments[0]!.noteId = 42;
    }

    return Response.json(state);
  };

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (b) => (b.getAttribute("aria-label") ?? b.textContent) === label,
    )!;

  try {
    await act(async () =>
      root.render(
        <ReviewSessionProvider session={session}>
          <ReviewPanelProvider>
            <CommentsProvider>
              <CommentsPanel />
            </CommentsProvider>
          </ReviewPanelProvider>
        </ReviewSessionProvider>,
      ),
    );
    expect(container.textContent).toContain("@andrew");
    await act(async () => button("New comment").click());
    const textbox = container.querySelector('[role="textbox"]')!;
    // The editor picks up typing from DOM mutations.
    await act(async () => {
      textbox.firstElementChild!.prepend("Latest reply");
    });
    await act(async () => button("Post").click());
    expect(calls).not.toContain("/gitlab/post");
    expect(textbox.textContent).toBe("Latest reply");
    expect(container.textContent).toContain("Disk unavailable");
    rejectSave = false;
    await act(async () => button("Post").click());
    expect(calls.at(-1)).toBe("/gitlab/post");
    expect(postedText).toBe("Latest reply");
    expect(container.querySelector('[role="textbox"]')).toBeNull();

    const historical = {
      ...session,
      review: { ...session.review!, historicalRevision: "0" },
    };

    const callsBefore = calls.length;
    await act(async () =>
      root.render(
        <ReviewSessionProvider session={historical}>
          <ReviewPanelProvider>
            <CommentsProvider>
              <CommentsPanel />
            </CommentsProvider>
          </ReviewPanelProvider>
        </ReviewSessionProvider>,
      ),
    );
    expect(button("New comment").disabled).toBe(true);
    expect(button("Post all").disabled).toBe(true);
    expect(calls.length).toBe(callsBefore);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("shows agent comments without sending controls when the review has no provider", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Range.prototype.getClientRects = () =>
    document.createElement("span").getClientRects();
  Range.prototype.getBoundingClientRect = () => new DOMRect();

  const state: CommentsState = {
    comments: [
      {
        id: crypto.randomUUID(),
        text: "Consider a guard here",
        author: "agent",
        target: { kind: "general" },
        version: 1,
        status: "saved",
      },
    ],
  };

  const session = testReviewSession();
  const calls: string[] = [];
  session.fetch = async (endpoint) => {
    calls.push(endpoint);

    return Response.json(state);
  };

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () =>
      root.render(
        <ReviewSessionProvider session={session}>
          <ReviewPanelProvider>
            <CommentsProvider>
              <CommentsPanel />
            </CommentsProvider>
          </ReviewPanelProvider>
        </ReviewSessionProvider>,
      ),
    );
    expect(container.textContent).toContain("Agent");
    expect(container.querySelector('[role="textbox"]')?.textContent).toContain(
      "Consider a guard here",
    );

    const labels = [...container.querySelectorAll("button")].map(
      (b) => b.getAttribute("aria-label") ?? b.textContent,
    );

    expect(labels).toContain("Discard");
    expect(labels).not.toContain("Post");
    expect(labels).not.toContain("Post all");
    expect(calls).toEqual(["/comments"]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
