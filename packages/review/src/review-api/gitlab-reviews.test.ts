import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import {
  GitLabRequestError,
  type GitLabRun,
  runGitLabCommand,
} from "./gitlab.js";
import { createReviewApi } from "./http.js";
import { openLocalReviewStore } from "./local-data.js";

it("creates an isolated MR once, retains drafts on partial posting and refuses dirty/committed advancement", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "gitlab-mr-"));
  const origin = path.join(root, "origin");

  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: origin, encoding: "utf8" }).trim();

  execFileSync("git", ["init", "-q", origin]);
  git("config", "user.email", "test@example.test");
  git("config", "user.name", "Test");
  writeFileSync(path.join(origin, "code.ts"), "one\ntwo\nthree\n");
  git("add", ".");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(path.join(origin, "code.ts"), "one\ntwo changed\nthree\n");
  git("commit", "-qam", "head");
  let head = git("rev-parse", "HEAD");
  let posts = 0;
  let resolutions = 0;
  let uncertain = false;
  const account = { id: 5, username: "andrew", name: "Andrew" };

  const note = (id: number, body: string) => ({
    id,
    body,
    author: account,
    created_at: "2026-10-07",
    resolvable: true,
    resolved: resolutions > 0,
  });

  const run: GitLabRun = async (file, args, options) => {
    if (file === "git") {
      const rewritten = [...args];

      if (args[0] === "clone") rewritten[rewritten.length - 2] = origin;

      if (args[0] === "fetch") {
        rewritten[rewritten.length - 2] = origin;

        if (rewritten.at(-1)?.startsWith("refs/merge-requests/"))
          rewritten[rewritten.length - 1] = head;
      }

      return runGitLabCommand(file, rewritten, options);
    }

    if (args[0] === "config") return "https";
    const endpoint = args[args.indexOf("--method") + 2]!;
    const method = args[args.indexOf("--method") + 1];

    if (endpoint === "user") return JSON.stringify(account);

    if (endpoint === "projects/9")
      return JSON.stringify({
        id: 9,
        path_with_namespace: "team/repo",
        http_url_to_repo: "https://gitlab.test/team/repo.git",
        ssh_url_to_repo: "git@gitlab.test:team/repo.git",
      });

    if (method === "POST") {
      posts++;

      if (uncertain) throw new GitLabRequestError();

      if (JSON.parse(options.input!).body === "fail")
        throw new GitLabRequestError(403);

      return JSON.stringify({
        id: "posted",
        notes: [note(100 + posts, JSON.parse(options.input!).body)],
      });
    }

    if (method === "PUT") {
      resolutions++;

      return JSON.stringify({ id: "thread", notes: [note(1, "remote")] });
    }

    if (endpoint.includes("/discussions"))
      return JSON.stringify([{ id: "thread", notes: [note(1, "remote")] }]);

    return JSON.stringify({
      iid: 1,
      project_id: 9,
      title: "MR title",
      diff_refs: { base_sha: base, start_sha: base, head_sha: head },
    });
  };

  const local = openLocalReviewStore(path.join(root, "review.sqlite"), {
    gitlab: { run, cloneRoot: path.join(root, "clones") },
    manageWorkspaces: false,
  });

  try {
    const create = () =>
      local.store.execute({
        commandId: randomUUID(),
        operation: {
          type: "create",
          mergeRequestUrl: "https://gitlab.test/team/repo/-/merge_requests/1",
        },
      });

    const first = await create();
    const second = await create();
    expect(first.reviewId).toBe(second.reviewId);
    const snapshot = local.store.read(first.reviewId);
    const checkout = local.store.repositoryPath(snapshot.pins!.repositoryId);
    expect(checkout).not.toBe(origin);

    expect(() =>
      local.store.execute({
        commandId: randomUUID(),
        operation: {
          type: "create",
          mergeRequestUrl: "https://gitlab.test/team/repo/-/merge_requests/1",
          repositoryId: "no",
        },
      }),
    ).toThrow(/cannot be combined/);

    const drafts = ["okay", "fail"].map((text) =>
      local.store.gitlab.save(first.reviewId, {
        id: randomUUID(),
        text,
        target: { kind: "general" },
      }),
    );

    await local.data.gitlab.post(first.reviewId);
    expect(
      local.store.gitlab.read(first.reviewId).drafts.map((d) => d.status),
    ).toEqual(["sent", "failed"]);
    expect(posts).toBe(2);
    await local.data.gitlab.post(first.reviewId, drafts[0]!.id);
    expect(posts).toBe(2);

    const reply = local.store.gitlab.save(first.reviewId, {
      id: randomUUID(),
      text: "unsent reply",
      target: { kind: "reply", discussionId: "thread" },
    });

    await local.data.gitlab.resolve(first.reviewId, "thread");
    expect(
      local.store.gitlab
        .read(first.reviewId)
        .drafts.find((d) => d.id === reply.id)?.text,
    ).toBe("unsent reply");
    uncertain = true;
    await local.data.gitlab.post(first.reviewId, reply.id);
    await local.data.gitlab.post(first.reviewId, reply.id);
    expect(posts).toBe(3);
    expect(
      local.store.gitlab
        .read(first.reviewId)
        .drafts.find((d) => d.id === reply.id)?.status,
    ).toBe("uncertain");

    const inline = await local.data.gitlab.save(first.reviewId, {
      id: randomUUID(),
      text: "range draft",
      target: {
        kind: "inline",
        position: {
          baseSha: base,
          startSha: base,
          headSha: snapshot.pins!.head,
          oldPath: "unrelated.ts",
          newPath: "code.ts",
          side: "head",
          from: 2,
          to: 2,
        },
      },
    });

    expect(
      inline.target.kind === "inline" && inline.target.position.oppositeFrom,
    ).toBeUndefined();
    expect(
      inline.target.kind === "inline" && inline.target.position.oldPath,
    ).toBe("code.ts");
    writeFileSync(
      path.join(origin, "code.ts"),
      "added\none\ntwo changed\nthree\n",
    );
    git("commit", "-qam", "next");
    head = git("rev-parse", "HEAD");
    writeFileSync(path.join(checkout, "dirty"), "keep");
    await local.data.gitlab.refresh(first.reviewId);
    expect(local.store.read(first.reviewId).pins?.head).toBe(
      snapshot.pins?.head,
    );
    expect(local.store.gitlab.read(first.reviewId).sourceError).toMatch(
      /clean/,
    );
    rmSync(path.join(checkout, "dirty"));
    await local.data.gitlab.refresh(first.reviewId);
    expect(local.store.read(first.reviewId).pins?.head).toBe(head);

    const moved = local.store.gitlab
      .read(first.reviewId)
      .drafts.find((d) => d.id === inline.id)!;

    expect(moved.target.kind === "inline" && moved.target.position.from).toBe(
      3,
    );
    expect(moved.text).toBe("range draft");
    execFileSync(
      "git",
      [
        "-c",
        "user.email=test@example.test",
        "-c",
        "user.name=Test",
        "commit",
        "--allow-empty",
        "-qm",
        "local",
      ],
      { cwd: checkout },
    );
    await local.data.gitlab.refresh(first.reviewId);
    expect(local.store.gitlab.read(first.reviewId).sourceError).toMatch(/HEAD/);
    execFileSync("git", ["checkout", "--detach", head], {
      cwd: checkout,
      stdio: "pipe",
    });
    rmSync(checkout, { recursive: true });
    await local.data.gitlab.refresh(first.reviewId);
    expect(local.store.gitlab.read(first.reviewId).sourceError).toBeUndefined();
    expect(
      local.store.gitlab
        .read(first.reviewId)
        .drafts.find((d) => d.id === inline.id)?.text,
    ).toBe("range draft");
    const api = createReviewApi(local.store, local.data);

    const historical = await api.request(
      `/${first.reviewId}/gitlab/post?version=0`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );

    expect(historical.status).toBe(409);
  } finally {
    await local.data.close();
    await local.store.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
