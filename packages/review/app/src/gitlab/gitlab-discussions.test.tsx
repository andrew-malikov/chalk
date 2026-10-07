import { ReviewSessionProvider } from "@canvas/host/review-session";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import type { GitLabState } from "@dev.fast/review-protocol";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { GitLabProvider } from "./gitlab-context";
import { GitLabDiscussionContent } from "./gitlab-discussions";

it("keeps unsaved text after an autosave failure and flushes the latest edit before explicit posting", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

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
    discussions: [],
    drafts: [],
  };

  const session = testReviewSession();
  session.review!.gitlab = state.identity;
  const calls: string[] = [];
  let rejectSave = true;
  let postedText: string | undefined;
  session.fetch = async (endpoint, init) => {
    calls.push(endpoint);
    const input = init?.body ? JSON.parse(String(init.body)) : {};

    if (endpoint === "/gitlab/drafts") {
      if (rejectSave)
        return Response.json({ error: "Disk unavailable" }, { status: 409 });
      const previous = state.drafts.find((d) => d.id === input.id);

      const draft = {
        ...input,
        status: "saved",
        version: (previous?.version ?? 0) + 1,
      };

      state.drafts = state.drafts.filter((d) => d.id !== input.id);
      state.drafts.push(draft);

      return Response.json(draft);
    }

    if (endpoint === "/gitlab/post") {
      postedText = state.drafts[0]?.text;
      state.drafts[0]!.status = "sent";
      state.drafts[0]!.noteId = 42;
    }

    return Response.json(state);
  };

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    )!;

  try {
    await act(async () =>
      root.render(
        <ReviewSessionProvider session={session}>
          <GitLabProvider>
            <GitLabDiscussionContent />
          </GitLabProvider>
        </ReviewSessionProvider>,
      ),
    );
    expect(container.textContent).toContain("@andrew");
    await act(async () => button("New comment").click());
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, "Latest reply");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Post").click());
    expect(calls).not.toContain("/gitlab/post");
    expect(textarea.value).toBe("Latest reply");
    expect(container.textContent).toContain("Disk unavailable");
    rejectSave = false;
    await act(async () => button("Post").click());
    expect(calls.at(-1)).toBe("/gitlab/post");
    expect(postedText).toBe("Latest reply");
    expect(container.textContent).toContain("Sent");
    const historical = {
      ...session,
      review: { ...session.review!, historicalRevision: "0" },
    };
    const callsBefore = calls.length;
    await act(async () =>
      root.render(
        <ReviewSessionProvider session={historical}>
          <GitLabProvider>
            <GitLabDiscussionContent />
          </GitLabProvider>
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
