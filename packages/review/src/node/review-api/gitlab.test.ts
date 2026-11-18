import { afterEach, describe, expect, it, vi } from "vitest";

import { GitLabClient, mergeRequestAddress, remapLineRange } from "./gitlab.js";

describe("GitLab boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves nested projects and explicit self-hosted ports", () => {
    expect(
      mergeRequestAddress(
        "https://gitlab.acme.test:8443/team/platform/api/-/merge_requests/12",
      ),
    ).toEqual({
      host: "gitlab.acme.test:8443",
      projectPath: "team/platform/api",
      iid: 12,
      url: "https://gitlab.acme.test:8443/team/platform/api/-/merge_requests/12",
    });
  });

  it.each([
    "http://gitlab.com/a/b/-/merge_requests/1",
    "https://token@gitlab.com/a/b/-/merge_requests/1",
    "https://gitlab.com/a/../b/-/merge_requests/1",
    "https://gitlab.com/a/b/-/merge_requests/0",
    "https://gitlab.com/a/b/-/merge_requests/9007199254740993",
    "https://gitlab.com/a/b/-/merge_requests/1?token=secret",
  ])("rejects untrusted MR URL %s before any request", (url) => {
    expect(() => mergeRequestAddress(url)).toThrow(/GitLab/);
  });

  it("imports actual comments and substantive bots but omits system activity", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json([
        {
          id: "thread",
          notes: [
            {
              id: 1,
              body: "marked ready",
              system: true,
              author: { id: 1, username: "maya", name: "Maya" },
              created_at: "2026-10-07",
            },
            {
              id: 2,
              body: "Cancellation needs a guard",
              system: false,
              resolvable: true,
              resolved: false,
              author: { id: 2, username: "bot", name: "Review bot", bot: true },
              created_at: "2026-10-07",
            },
          ],
        },
      ]),
    );

    const discussions = await new GitLabClient("gitlab.acme.test").discussions(
      14,
      12,
    );
    expect(discussions[0]?.comments.map((note) => note.body)).toEqual([
      "Cancellation needs a guard",
    ]);
    expect(discussions[0]?.comments[0]?.author.bot).toBe(true);
  });
});

describe("conservative comment mapping", () => {
  it("moves an unchanged range when code is inserted before it", () => {
    expect(
      remapLineRange("a\nb\nc\nd\ne\nf\ng", "added\na\nb\nc\nd\ne\nf\ng", 4, 5),
    ).toEqual({ from: 5, to: 6 });
  });

  it("refuses changed or ambiguous selected context", () => {
    expect(remapLineRange("a\nb\nc", "a\nrewritten\nc", 2, 2)).toBeNull();
    expect(remapLineRange("a\nb\nc", "a\nb\nc\na\nb\nc", 2, 2)).toBeNull();
  });
});
