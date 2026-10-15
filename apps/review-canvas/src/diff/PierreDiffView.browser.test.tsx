import { AgentSelectionProvider } from "@canvas/agent-context/agent-selection";
import { GitLabProvider } from "@canvas/gitlab/gitlab-context";
import { ReviewSessionProvider } from "@canvas/host/review-session";
import { ReviewDiffFilesProvider } from "@canvas/review/review-diff-files-context";
import { TestCanvasQuery } from "@canvas/test/canvas-query-test-utils";
import { testReviewSession } from "@canvas/test/review-session-test-utils";
import type {
  GitLabState,
  ReviewDiffFileWire,
  ReviewDiffLens,
  StructuralRegion,
} from "@chalk/review-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { PierreDiffView } from "./PierreDiffView";

let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

it("reads and replies to GitLab threads inside the diff, preserves failed saves, and resolves without losing drafts", async () => {
  const file: ReviewDiffFileWire = {
    path: "new.ts",
    previousPath: "old.ts",
    status: "renamed",
    additions: 1,
    deletions: 1,
  };

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
        resolved: false,
        resolvable: true,
        location: { file: "old.ts", side: "base", from: 1, to: 1 },
        comments: [
          {
            id: 1,
            body: "Can we preserve this behavior?",
            author: { id: 8, username: "reviewer", name: "Reviewer" },
            createdAt: "2026-10-07T10:00:00Z",
          },
        ],
      },
      {
        id: "general",
        resolved: false,
        resolvable: false,
        comments: [
          {
            id: 2,
            body: "General review feedback",
            author: { id: 8, username: "reviewer", name: "Reviewer" },
            createdAt: "2026-10-07T10:00:00Z",
          },
        ],
      },
    ],
    drafts: [],
  };

  const session = testReviewSession(
    {},
    {
      diffView: { files: async () => [file] },
      request: async () =>
        new Response(
          "diff --git a/old.ts b/new.ts\n--- a/old.ts\n+++ b/new.ts\n@@ -1 +1 @@\n-before\n+after\n",
        ),
    },
  );

  session.review = {
    ...session.review!,
    gitlab: state.identity,
    pins: {
      ...session.review!.pins!,
      base: state.refs.baseSha,
      head: state.refs.headSha,
    },
  };
  let failSave = true;
  const posts: string[] = [];
  session.fetch = async (endpoint, init) => {
    const input = init?.body ? JSON.parse(String(init.body)) : {};

    if (endpoint === "/gitlab/drafts") {
      if (failSave)
        return Response.json({ error: "Disk unavailable" }, { status: 409 });
      const previous = state.drafts.find((d) => d.id === input.id);

      const draft = {
        ...input,
        status: "saved",
        version: (previous?.version ?? 0) + 1,
      };

      state.drafts = [...state.drafts.filter((d) => d.id !== draft.id), draft];

      return Response.json(draft);
    }

    if (endpoint === "/gitlab/post") {
      const draft = state.drafts.find((d) => d.id === input.id)!;
      posts.push(draft.text);
      state.discussions[0]!.comments.push({
        ...state.discussions[0]!.comments[0]!,
        id: 3,
        body: draft.text,
        author: state.account!,
      });
      draft.status = "sent";
      draft.noteId = 3;
    }

    if (endpoint === "/gitlab/resolve") state.discussions[0]!.resolved = true;

    if (endpoint === "/gitlab/discard")
      state.drafts = state.drafts.filter((d) => d.id !== input.id);

    return Response.json(state);
  };

  const container = document.createElement("div");
  container.className = "review-canvas-root review-document";
  container.style.cssText = "height:800px;width:1000px;display:flex";
  document.body.append(container);
  root = createRoot(container);

  const render = async (historicalRevision: string | null = null) =>
    act(async () =>
      root!.render(
        <TestCanvasQuery>
          <ReviewSessionProvider
            session={{
              ...session,
              review: { ...session.review!, historicalRevision },
            }}
          >
            <GitLabProvider>
              <AgentSelectionProvider revision="gitlab">
                <ReviewDiffFilesProvider documentKey="gitlab">
                  <PierreDiffView inWorkspace />
                </ReviewDiffFilesProvider>
              </AgentSelectionProvider>
            </GitLabProvider>
          </ReviewSessionProvider>
        </TestCanvasQuery>,
      ),
    );

  await render();

  const thread = () =>
    container.querySelector<HTMLElement>(
      '[aria-label="GitLab discussion thread"]',
    )!;

  await vi.waitFor(() =>
    expect(thread()?.textContent).toContain("Can we preserve this behavior?"),
  );
  expect(container.textContent).not.toContain("General review feedback");

  const click = async (label: string) =>
    userEvent.click(
      [...thread().querySelectorAll("button")].find(
        (b) => b.textContent === label,
      )!,
    );

  await click("Reply");
  await vi.waitFor(() =>
    expect(thread().querySelector("textarea")).not.toBeNull(),
  );
  await userEvent.fill(
    thread().querySelector("textarea")!,
    "Preserved with a regression check",
  );
  await click("Post");
  await vi.waitFor(() =>
    expect(thread().textContent).toContain("Disk unavailable"),
  );
  expect(posts).toEqual([]);
  expect(thread().querySelector("textarea")!.value).toBe(
    "Preserved with a regression check",
  );
  failSave = false;
  await click("Post");
  await vi.waitFor(() =>
    expect(thread().textContent).toContain("Preserved with a regression check"),
  );
  expect(posts).toEqual(["Preserved with a regression check"]);
  await vi.waitFor(() => expect(thread().querySelector("textarea")).toBeNull());
  await click("Reply");
  await userEvent.fill(thread().querySelector("textarea")!, "Follow-up draft");
  await click("Resolve");
  await vi.waitFor(() => expect(state.discussions[0]!.resolved).toBe(true));
  expect(state.drafts.find((d) => d.status === "saved")?.text).toBe(
    "Follow-up draft",
  );
  expect(thread().querySelector("textarea")!.value).toBe("Follow-up draft");
  await click("Discard");
  await vi.waitFor(() =>
    expect(thread().querySelector("details")?.open).toBe(false),
  );
  await userEvent.click(thread().querySelector("summary")!);
  expect(thread().querySelector("details")!.open).toBe(true);
  await render("historic");
  await vi.waitFor(() => expect(thread()).toBeNull());
});

it("comments on the full native text selection using the selection button", async () => {
  const file: ReviewDiffFileWire = {
    path: "new.ts",
    previousPath: "old.ts",
    status: "renamed",
    additions: 2,
    deletions: 1,
  };

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

  const session = testReviewSession(
    {},
    {
      diffView: { files: async () => [file] },
      request: async () =>
        new Response(
          "diff --git a/old.ts b/new.ts\n--- a/old.ts\n+++ b/new.ts\n@@ -1 +1,2 @@\n-before\n+after\n+more\n",
        ),
    },
  );

  session.review = { ...session.review!, gitlab: state.identity };
  session.fetch = async (endpoint, init) => {
    if (endpoint === "/gitlab/drafts") {
      const draft = {
        ...JSON.parse(String(init?.body)),
        status: "saved",
        version: 1,
      };

      state.drafts = [draft];

      return Response.json(draft);
    }

    return Response.json(state);
  };

  const container = document.createElement("div");
  container.className = "review-canvas-root review-document";
  container.style.cssText = "height:500px;width:1000px;display:flex";
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <TestCanvasQuery>
        <ReviewSessionProvider session={session}>
          <GitLabProvider>
            <AgentSelectionProvider revision="selection">
              <ReviewDiffFilesProvider documentKey="selection">
                <PierreDiffView inWorkspace />
              </ReviewDiffFilesProvider>
            </AgentSelectionProvider>
          </GitLabProvider>
        </ReviewSessionProvider>
      </TestCanvasQuery>,
    ),
  );
  await vi.waitFor(() =>
    expect(
      container
        .querySelector("diffs-container")
        ?.shadowRoot?.querySelector('[data-additions] [data-line="2"]') ?? null,
    ).not.toBeNull(),
  );
  const shadow = container.querySelector("diffs-container")!.shadowRoot!;
  const first = shadow.querySelector('[data-additions] [data-line="1"]')!;
  const last = shadow.querySelector('[data-additions] [data-line="2"]')!;
  await act(async () => {
    document
      .getSelection()!
      .setBaseAndExtent(first, 0, last, last.childNodes.length);
    document.dispatchEvent(new Event("selectionchange"));
  });

  const floating = container.querySelector<HTMLButtonElement>(
    '[aria-label="GitLab comment"]',
  )!;

  const end = last.lastElementChild!.getBoundingClientRect();
  const rect = floating.getBoundingClientRect();
  expect(Math.abs(rect.left - end.right)).toBeLessThan(20);
  expect(rect.top).toBeLessThan(end.bottom);
  expect(rect.bottom).toBeGreaterThan(end.top);

  await userEvent.click(floating);
  await vi.waitFor(() =>
    expect(container.querySelector("textarea")).not.toBeNull(),
  );
  expect(container.textContent).toContain("new.ts:1–2 · head");
  await userEvent.fill(container.querySelector("textarea")!, "Selected range");
  await vi.waitFor(() => expect(state.drafts[0]?.text).toBe("Selected range"));
  expect(state.drafts[0]!.target).toMatchObject({
    kind: "inline",
    position: {
      oldPath: "old.ts",
      newPath: "new.ts",
      side: "head",
      from: 1,
      to: 2,
    },
  });
});

it("shows real Git rows progressively, navigates files, marks viewed, and switches the shared layout", async () => {
  const files: ReviewDiffFileWire[] = ["a.ts", "b.ts"].map((path) => ({
    path,
    status: "modified",
    additions: 1,
    deletions: 1,
  }));

  let release!: () => void;

  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  let layout: "split" | "unified" = "split";
  let onLayout = () => {};

  const request = vi.fn<
    (source: string, init?: RequestInit) => Promise<Response>
  >(async (source, init) => {
    expect(new Headers(init?.headers).get("x-review-token")).toBe(
      "secret-token",
    );
    const url = new URL(source);
    expect(url.searchParams.get("commit")).toBe("commit-a");

    if (url.searchParams.get("format") !== "raw") return Response.json(files);
    const file = url.searchParams.get("file")!;

    if (file === "b.ts") await pending;

    return new Response(
      `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-before ${file}\n+after ${file}\n`,
    );
  });

  const session = testReviewSession(
    {},
    {
      request,
      currentDiffLayout: () => layout,
      onDidChangeDiffLayout: (listener) => {
        onLayout = () => listener(layout);

        return { dispose() {} };
      },
    },
  );

  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const apiUrl = session.apiUrl;
  session.apiUrl = (endpoint) => {
    const url = new URL(apiUrl(endpoint));
    url.searchParams.set("version", "7");

    return url.href;
  };

  const context = vi
    .spyOn(session, "fetch")
    .mockImplementation(
      async () => new Response(JSON.stringify({ text: "selected Git patch" })),
    );

  const container = document.createElement("div");
  const tree = document.createElement("div");
  container.style.cssText = "height:500px;width:1000px;display:flex";
  container.className = "review-canvas-root review-document";
  document.body.append(tree, container);
  root = createRoot(container);
  const toggleViewed = vi.fn<(path: string) => void>();

  const progress = {
    files: files.map((file) => ({
      path: file.path,
      total: { additions: 1, deletions: 1 },
      remaining: { additions: 1, deletions: 1 },
      viewedRanges: [],
      changedRanges: [],
      state: "unread" as const,
    })),
  };

  await act(async () =>
    root!.render(
      <TestCanvasQuery>
        <ReviewSessionProvider session={session}>
          <AgentSelectionProvider revision="one">
            <PierreDiffView
              scope={{ commit: "commit-a" }}
              treeContainer={tree}
              progress={progress}
              onToggleViewed={toggleViewed}
              inWorkspace
            />
          </AgentSelectionProvider>
        </ReviewSessionProvider>
      </TestCanvasQuery>,
    ),
  );

  const code = () =>
    [...container.querySelectorAll("diffs-container")].flatMap((host) => [
      ...host.shadowRoot!.querySelectorAll("code"),
    ]);

  await vi.waitFor(() =>
    expect(
      code().some((node) => node.textContent?.includes("after a.ts")),
    ).toBe(true),
  );
  expect(code().some((node) => node.textContent?.includes("b.ts"))).toBe(false);
  expect(tree.textContent).toContain("b.ts");
  release();
  await vi.waitFor(() =>
    expect(
      code().some((node) => node.textContent?.includes("after b.ts")),
    ).toBe(true),
  );

  const wrap = container.querySelector<HTMLButtonElement>(
    '[aria-pressed="false"]',
  )!;

  await userEvent.click(wrap);
  expect(wrap.getAttribute("aria-pressed")).toBe("true");

  const added = code().find(
    (node) =>
      node.hasAttribute("data-additions") &&
      node.textContent?.includes("after a.ts"),
  )!;

  const gutter = added.querySelector<HTMLElement>(
    '[data-gutter] [data-column-number="1"]',
  )!;

  await userEvent.click(gutter);
  await vi.waitFor(() =>
    expect(container.querySelector('[aria-label="Copy ref"]')).not.toBeNull(),
  );
  expect(context).not.toHaveBeenCalled();
  await userEvent.click(
    container.querySelector<HTMLButtonElement>('[aria-label="Copy ref"]')!,
  );
  await vi.waitFor(() =>
    expect(copy).toHaveBeenCalledWith("selected Git patch"),
  );
  const selection = JSON.parse(context.mock.calls[0]![1]!.body as string);
  expect(selection.target).toMatchObject({
    kind: "code",
    path: "a.ts",
    side: "head",
    startLine: 1,
  });
  expect(selection.selectedDiff.rows).toEqual([
    { kind: "deleted", text: "before a.ts" },
    { kind: "added", text: "after a.ts" },
  ]);
  expect(selection.apiSource.commit).toBe("commit-a");

  await act(async () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
  );
  const textRange = document.createRange();
  textRange.selectNodeContents(added.querySelector("[data-line]")!);
  await act(async () => {
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(textRange);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await vi.waitFor(() =>
    expect(container.querySelector('[aria-label="Copy ref"]')).not.toBeNull(),
  );
  expect(document.getSelection()!.toString()).toContain("after a.ts");
  await userEvent.click(
    container.querySelector<HTMLButtonElement>('[aria-label="Copy ref"]')!,
  );
  await vi.waitFor(() => expect(context).toHaveBeenCalledTimes(2));
  const textSelection = JSON.parse(context.mock.calls[1]![1]!.body as string);
  expect(textSelection.target).toEqual(selection.target);
  expect(textSelection.selectedDiff).toEqual(selection.selectedDiff);
  await act(async () => {
    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
  });
  expect(container.querySelector('[aria-label="Copy ref"]')).toBeNull();

  const viewed = tree.querySelector<HTMLButtonElement>(
    '[aria-label="Mark viewed: b.ts"]',
  )!;

  viewed.click();
  expect(toggleViewed).toHaveBeenCalledWith("b.ts");
  await act(async () => {
    layout = "unified";
    onLayout();
  });
  await vi.waitFor(() =>
    expect(
      code().every(
        (node) =>
          !node.hasAttribute("data-deletions") &&
          !node.hasAttribute("data-additions"),
      ),
    ).toBe(true),
  );

  const collapse = container.querySelector<HTMLButtonElement>(
    '[aria-label="Collapse a.ts"]',
  )!;

  collapse.click();
  await vi.waitFor(() =>
    expect(
      code().some((node) => node.textContent?.includes("after a.ts")),
    ).toBe(false),
  );
});

it("keeps renamed lens files visible in worktrees without expanding from live source reads", async () => {
  const file: ReviewDiffFileWire = {
    path: "new.ts",
    previousPath: "old.ts",
    status: "renamed",
    additions: 1,
    deletions: 1,
  };

  const request = vi.fn<() => Promise<Response>>(
    async () =>
      new Response(
        "diff --git a/old.ts b/new.ts\n--- a/old.ts\n+++ b/new.ts\n@@ -10 +10 @@\n-before\n+after\n",
      ),
  );

  const post = vi.fn<() => Promise<{ ok: true }>>(async () => ({ ok: true }));

  const session = testReviewSession(
    {},
    { request, post, diffView: { files: async () => [file] } },
  );

  session.review = { ...session.review!, targetKind: "worktree" };
  const container = document.createElement("div");
  const tree = document.createElement("div");
  container.style.cssText = "height:500px;width:1000px;display:flex";
  document.body.append(tree, container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <TestCanvasQuery>
        <ReviewSessionProvider session={session}>
          <ReviewDiffFilesProvider documentKey="live">
            <PierreDiffView
              treeContainer={tree}
              lens={{
                id: "rename",
                title: "Rename",
                reviewId: "review",
                version: 1,
                ranges: [
                  { side: "base", file: "old.ts", fromLine: 10, toLine: 10 },
                ],
              }}
              inWorkspace
            />
          </ReviewDiffFilesProvider>
        </ReviewSessionProvider>
      </TestCanvasQuery>,
    ),
  );
  await vi.waitFor(() =>
    expect(
      container.querySelector("diffs-container")?.shadowRoot?.textContent,
    ).toContain("after"),
  );
  expect(tree.textContent).toContain("new.ts");
  expect(container.textContent).toContain(
    "Showing full file diffs for this lens",
  );
  expect(request.mock.calls).toHaveLength(1);
  expect(
    container
      .querySelector("diffs-container")!
      .shadowRoot!.querySelector("[data-expand]"),
  ).toBeNull();
  await userEvent.click(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Open source: new.ts"]',
    )!,
  );
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "reveal",
      args: expect.objectContaining({
        path: "new.ts",
        startLine: 1,
        endLine: 1,
        side: "head",
      }),
    }),
  );
});

function fold(
  id: number,
  tags: string[],
  from: number,
  to: number,
  children: StructuralRegion[] = [],
): StructuralRegion {
  const at = (line: number) => ({ line, column: 0 });

  return {
    id,
    fold_state_id: id,
    kind: "fold",
    tags,
    indent: at(from),
    start: at(from),
    end: at(to),
    children,
  };
}

function changedFile(path: string): ReviewDiffFileWire {
  return { path, status: "modified", additions: 100, deletions: 100 };
}

function fullPatch(path: string) {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,100 +1,100 @@\n${Array.from({ length: 100 }, (_, i) => `-before ${i + 1}\n`).join("")}${Array.from({ length: 100 }, (_, i) => `+after ${i + 1}\n`).join("")}`;
}

async function readingFixture({
  missingAnchor = false,
  lens,
}: { missingAnchor?: boolean; lens?: ReviewDiffLens } = {}) {
  const files = (lens ? ["a.ts", "b.ts", "c.ts"] : ["a.ts"]).map(changedFile);

  const session = testReviewSession(
    {},
    {
      request: async (input) => {
        const url = new URL(input);

        return url.searchParams.get("format") === "raw"
          ? new Response(fullPatch(url.searchParams.get("file")!))
          : Response.json(files);
      },
    },
  );

  if (missingAnchor) {
    const key = session.storageKey(
      "pierre-diff-view",
      JSON.stringify([
        session.review?.pins,
        session.review?.historicalRevision,
        "abc",
        "all",
      ]),
    );

    localStorage.setItem(
      key,
      JSON.stringify({
        collapsed: [],
        anchor: { id: "removed.ts", offset: 0 },
      }),
    );
  }

  const container = document.createElement("div");
  container.style.cssText = "height:400px;width:1000px;display:flex";
  document.body.append(container);

  async function render() {
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <TestCanvasQuery>
          <ReviewSessionProvider session={session}>
            <PierreDiffView
              scope={{ commit: "abc" }}
              revealFile={missingAnchor || lens ? undefined : "a.ts"}
              restoreFile
              lens={lens}
              inWorkspace
            />
          </ReviewSessionProvider>
        </TestCanvasQuery>,
      ),
    );
  }

  function scroller() {
    let node = container.querySelector("diffs-container")?.parentElement;

    while (
      node &&
      node !== container &&
      !["auto", "scroll"].includes(getComputedStyle(node).overflowY)
    )
      node = node.parentElement;

    if (!node || node === container)
      throw new Error("scrollable comparison not ready");

    return node;
  }

  function readingLine(path = "a.ts") {
    const top = scroller().getBoundingClientRect().top + 50;

    const host = [...container.querySelectorAll("diffs-container")].find(
      (host) => host.shadowRoot?.textContent?.includes(path),
    );

    return Math.min(
      ...[
        ...(host?.shadowRoot?.querySelectorAll<HTMLElement>("[data-line]") ??
          []),
      ].flatMap((row) =>
        row.getBoundingClientRect().height < 100 &&
        row.getBoundingClientRect().bottom > top
          ? [Number(row.dataset.line)]
          : [],
      ),
    );
  }

  await render();
  await vi.waitFor(() => expect(scroller().scrollHeight).toBeGreaterThan(1000));

  return { render, scroller, readingLine };
}

it.each([false, true])(
  "restores the reading line when reopening a commit file (missing previous file: %s)",
  async (missingAnchor) => {
    const { render, scroller, readingLine } = await readingFixture({
      missingAnchor,
    });

    await act(async () => {
      scroller().scrollTop = 900;
      scroller().dispatchEvent(new Event("scroll"));
    });
    await vi.waitFor(() => {
      expect(Number.isFinite(readingLine())).toBe(true);
      expect(readingLine()).toBeGreaterThan(30);
    });
    const line = readingLine();
    await act(async () => root!.unmount());
    await render();
    await vi.waitFor(() =>
      expect(Math.abs(readingLine() - line)).toBeLessThan(3),
    );
  },
);

it("reveals a lens source line in a file initially outside the viewport", async () => {
  const lens: ReviewDiffLens = {
    id: "last-file",
    title: "Last file",
    reviewId: "test-review",
    version: 1,
    ranges: [
      { file: "c.ts", side: "head", fromLine: 80, toLine: 81 },
      { file: "a.ts", side: "head", fromLine: 1, toLine: 2 },
      { file: "b.ts", side: "head", fromLine: 1, toLine: 2 },
    ],
  };

  const { readingLine } = await readingFixture({ lens });
  await vi.waitFor(() => {
    expect(readingLine("c.ts")).toBeGreaterThanOrEqual(78);
    expect(readingLine("c.ts")).toBeLessThanOrEqual(83);
  });
});

it("uses the structural default, navigates functions, and offers text mode when the engine fails", async () => {
  const file = {
    path: "a.ts",
    status: "modified" as const,
    additions: 2,
    deletions: 2,
  };

  const before =
    "function answer() {\n  return 1;\n}\n\nfunction unchanged() {\n  return 5;\n}\n";

  const after = before
    .replace("return 1", "return 2")
    .replace("  return 5", "    return 5");

  let fail = false;

  const session = testReviewSession(
    {},
    {
      defaultDiffMode: "structural",
      request: async (input) => {
        const url = new URL(input);

        if (url.pathname.endsWith("/structural-diff")) {
          if (fail)
            return new Response(
              JSON.stringify({
                type: "error",
                message: "Engine unavailable",
              }) + "\n",
            );

          return new Response(
            [
              {
                type: "file",
                file: { rhs: { path: "a.ts", oid: "", mode: "" } },
                diff: {
                  type: "text",
                  lhs: { text: before, root: fold(0, [], 0, 0) },
                  rhs: {
                    text: after,
                    root: fold(0, [], 0, 0, [
                      fold(1, ["context:scope"], 0, 3, [
                        fold(2, ["context:body"], 1, 2),
                      ]),
                    ]),
                  },
                  stats: {
                    textual: { added: 2, removed: 2 },
                    visible: { added: 1, removed: 1 },
                  },
                  structural_changes: { base: [[1, 2]], head: [[1, 2]] },
                },
              },
              { type: "complete", succeeded: 1, failed: 0 },
            ]
              .map((event) => JSON.stringify(event))
              .join("\n"),
          );
        }

        if (url.searchParams.get("format") !== "raw")
          return Response.json([file]);

        return new Response(
          "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,7 +1,7 @@\n function answer() {\n-  return 1;\n+  return 2;\n }\n \n function unchanged() {\n-  return 5;\n+    return 5;\n }\n",
        );
      },
    },
  );

  const container = document.createElement("div");
  container.className = "review-canvas-root review-document";
  container.style.cssText = "height:500px;width:1000px;display:flex";
  document.body.append(container);
  root = createRoot(container);

  const render = async (commit: string) =>
    act(async () =>
      root!.render(
        <TestCanvasQuery>
          <ReviewSessionProvider session={session}>
            <AgentSelectionProvider revision={commit}>
              <PierreDiffView scope={{ commit }} inWorkspace />
            </AgentSelectionProvider>
          </ReviewSessionProvider>
        </TestCanvasQuery>,
      ),
    );

  await render("one");

  const changes = () =>
    [...container.querySelectorAll("diffs-container")]
      .flatMap((host) => [
        ...host.shadowRoot!.querySelectorAll(
          '[data-line-type="change-addition"]',
        ),
      ])
      .map((row) => row.textContent)
      .join("\n");

  const mode = () =>
    container.querySelector<HTMLSelectElement>('[aria-label="Diff mode"]')!;

  await vi.waitFor(() => expect(mode()?.value).toBe("structural"));
  await vi.waitFor(() => expect(changes()).toContain("return 2"));
  expect(changes()).not.toContain("return 5");

  const functions = container.querySelector<HTMLSelectElement>(
    '[aria-label="Changed functions"]',
  )!;

  expect(functions.textContent).toContain("function answer()");
  await act(async () => {
    functions.value = "0";
    functions.dispatchEvent(new Event("change", { bubbles: true }));
  });
  fail = true;
  await render("two");
  await vi.waitFor(() =>
    expect(container.textContent).toContain("Engine unavailable"),
  );

  const textButton = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Show text diff",
  )!;

  await act(async () => textButton.click());
  await vi.waitFor(() => expect(changes()).toContain("return 5"));
  expect(mode().value).toBe("text");
});
