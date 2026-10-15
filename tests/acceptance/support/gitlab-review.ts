import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { GitLabState } from "@chalk/review-contracts";
import { type Page, expect } from "@playwright/test";

import {
  GitLabRequestError,
  type GitLabRun,
  runGitLabCommand,
} from "../../../packages/review/src/node/review-api/gitlab";
import { openLocalReviewStore } from "../../../packages/review/src/node/review-api/local-data";
import { createReviewApi } from "../../../packages/server/src/review-api/http";

const originalCode = "// before\nexport const value = 2;\n// after\n";

export class GitLabReview {
  private readonly directory = mkdtempSync(
    path.join(tmpdir(), "chalk-gitlab-acceptance-"),
  );
  private readonly origin = path.join(this.directory, "origin");
  private readonly database = path.join(this.directory, "reviews.db");
  private base = "";
  private head = "";
  private reviewId = "";
  private historicalVersion: number | undefined;
  private account = { id: 7, username: "reviewer", name: "Reviewer" };
  private readonly errors: string[] = [];
  private local = this.openStorage();
  private api = createReviewApi(this.local.store, this.local.data);
  saveUnavailable = false;
  rejectOnce: string | undefined;
  uncertainNextPost = false;
  readonly attempts: string[] = [];
  readonly received: string[] = [];

  constructor(private readonly page: Page) {}

  private git(...args: string[]) {
    return execFileSync("git", args, {
      cwd: this.origin,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
      },
    }).trim();
  }

  private commit(subject: string) {
    this.git("add", ".");
    this.git("-c", "commit.gpgsign=false", "commit", "-qm", subject);

    return this.git("rev-parse", "HEAD");
  }

  private note(id: number, body: string) {
    return {
      id,
      body,
      author: this.account,
      created_at: "2026-10-15T00:00:00Z",
      resolvable: true,
      resolved: false,
    };
  }

  private readonly run: GitLabRun = async (file, args, options) => {
    if (file === "git") {
      const local = [...args];

      if (args[0] === "clone") local[local.length - 2] = this.origin;

      if (args[0] === "fetch") {
        local[local.length - 2] = this.origin;

        if (local.at(-1)?.startsWith("refs/merge-requests/"))
          local[local.length - 1] = this.head;
      }

      return runGitLabCommand(file, local, options);
    }

    try {
      if (file !== "glab") throw new Error(`Unexpected executable: ${file}`);

      if (args[0] === "config") return "https";
      expect(args.slice(0, 3)).toEqual(["api", "--hostname", "gitlab.test"]);
      const method = args[4];
      const endpoint = args[5];

      if (method === "GET" && endpoint === "user")
        return JSON.stringify(this.account);

      if (method === "GET" && endpoint === "projects/9")
        return JSON.stringify({
          id: 9,
          path_with_namespace: "team/repo",
          http_url_to_repo: "https://gitlab.test/team/repo.git",
          ssh_url_to_repo: "git@gitlab.test:team/repo.git",
        });

      if (
        method === "GET" &&
        [
          "projects/team%2Frepo/merge_requests/1",
          "projects/9/merge_requests/1",
        ].includes(endpoint!)
      )
        return JSON.stringify({
          iid: 1,
          project_id: 9,
          title: "Feedback review",
          diff_refs: {
            base_sha: this.base,
            start_sha: this.base,
            head_sha: this.head,
          },
        });
      const discussions = "projects/9/merge_requests/1/discussions";

      if (method === "GET" && endpoint === `${discussions}?per_page=100&page=1`)
        return JSON.stringify([
          { id: "thread", notes: [this.note(1, "Existing discussion")] },
        ]);

      if (
        method === "POST" &&
        [discussions, `${discussions}/thread/notes`].includes(endpoint!)
      ) {
        const input = JSON.parse(options.input!);
        this.attempts.push(input.body);

        if (this.uncertainNextPost) {
          this.uncertainNextPost = false;
          throw new GitLabRequestError();
        }

        if (this.rejectOnce === input.body) {
          this.rejectOnce = undefined;
          throw new GitLabRequestError(403);
        }

        this.received.push(input.body);
        const note = this.note(100 + this.received.length, input.body);

        return JSON.stringify(
          endpoint === discussions
            ? { id: `posted-${note.id}`, notes: [note] }
            : note,
        );
      }

      throw new Error(`Unexpected GitLab request: ${method} ${endpoint}`);
    } catch (error) {
      if (!(error instanceof GitLabRequestError))
        this.errors.push(String(error));
      throw error;
    }
  };

  private openStorage() {
    return openLocalReviewStore(this.database, {
      manageWorkspaces: false,
      gitlab: {
        run: (...args) => this.run(...args),
        cloneRoot: path.join(this.directory, "clones"),
      },
    });
  }

  async setup() {
    mkdirSync(this.origin);
    this.git("init", "-q", "-b", "main");
    this.git("config", "user.name", "Acceptance Test");
    this.git("config", "user.email", "acceptance@example.invalid");
    writeFileSync(
      path.join(this.origin, "code.ts"),
      "// before\nexport const value = 1;\n// after\n",
    );
    this.base = this.commit("Base");
    writeFileSync(path.join(this.origin, "code.ts"), originalCode);
    this.head = this.commit("Update value");

    const created = await this.local.store.execute({
      commandId: randomUUID(),
      operation: {
        type: "create",
        mergeRequestUrl: "https://gitlab.test/team/repo/-/merge_requests/1",
      },
    });

    this.reviewId = created.reviewId;
    await this.page.route("**/reviews-api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (
        this.saveUnavailable &&
        request.method() === "POST" &&
        url.pathname.endsWith("/gitlab/drafts")
      ) {
        await route.fulfill({
          status: 409,
          json: { error: "Draft storage unavailable" },
        });

        return;
      }

      const response = await this.api.request(
        url.pathname.replace("/reviews-api", "") + url.search,
        {
          method: request.method(),
          headers: request.headers(),
          body: request.postData() ?? undefined,
        },
      );

      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    await this.page.goto("/");
    await this.page.waitForFunction(() => !!window.reviewHarness);
    await this.open();
  }

  async open(version?: number) {
    const snapshot = this.local.store.read(this.reviewId, version);
    await this.local.data.coverage(this.reviewId, snapshot.pins!, "textual");
    await this.page.evaluate(
      ({ snapshot, current }) =>
        window.reviewHarness.openStored(JSON.parse(snapshot), current),
      { snapshot: JSON.stringify(snapshot), current: version === undefined },
    );
    await this.page
      .getByRole("button", { name: "Discussions", exact: true })
      .click();
    await expect(
      this.page.getByRole("button", { name: "New comment", exact: true }),
    ).toBeVisible();

    if (version === undefined)
      await expect(
        this.page.getByRole("button", { name: "New comment", exact: true }),
      ).toBeEnabled();
  }

  async state(): Promise<GitLabState> {
    const response = await this.api.request(`/${this.reviewId}/gitlab`);
    expect(response.status).toBe(200);

    return response.json();
  }

  async retryUncertainPost() {
    const draft = (await this.state()).drafts[0]!;

    const response = await this.api.request(`/${this.reviewId}/gitlab/post`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: draft.id }),
    });

    expect(response.status).toBe(200);
    expect((await this.state()).drafts[0]?.status).toBe("uncertain");
  }

  async restart() {
    await this.page.evaluate(() => window.reviewHarness.close());
    await this.local.data.close();
    await this.local.store.close();
    this.local = this.openStorage();
    this.api = createReviewApi(this.local.store, this.local.data);
    await this.open();
  }

  advance(change: string) {
    const next =
      change === "inserted context"
        ? "// inserted\n" + originalCode
        : change === "rewritten context"
          ? originalCode.replace("value = 2", "value = 3")
          : change === "ambiguous context"
            ? originalCode + "\n" + originalCode
            : undefined;

    if (next === undefined) throw new Error(`Unknown code change: ${change}`);
    writeFileSync(path.join(this.origin, "code.ts"), next);
    this.head = this.commit("Advance merge request");
  }

  async openHistorical() {
    this.historicalVersion = this.local.store.read(this.reviewId).version;
    await this.local.store.execute({
      commandId: randomUUID(),
      operation: {
        type: "edit",
        reviewId: this.reviewId,
        edit: {
          type: "insert",
          content: { type: "markdown", markdown: "A newer version" },
        },
      },
    });
    await this.open(this.historicalVersion);
  }

  async historicalAction(action: string) {
    const draft = (await this.state()).drafts[0]!;

    const bodies = {
      drafts: {
        id: draft.id,
        text: "Historical overwrite",
        target: draft.target,
        version: draft.version,
      },
      discard: { id: draft.id },
      post: { id: draft.id },
      resolve: { discussionId: "thread" },
      recover: { id: draft.id, verified: true, posted: false },
      refresh: {},
    };

    const body = Object.entries(bodies).find(([key]) => key === action)?.[1];
    expect(body, `Unknown historical action: ${action}`).toBeDefined();

    return this.api.request(
      `/${this.reviewId}/gitlab/${action}?version=${this.historicalVersion}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  changeAccount() {
    this.account = {
      id: 8,
      username: "other-reviewer",
      name: "Other Reviewer",
    };
  }

  async dispose() {
    try {
      if (await this.page.evaluate(() => !!window.reviewHarness)) {
        await this.page.evaluate(() => window.reviewHarness.close());
        await expect
          .poll(() =>
            this.page.evaluate(() => window.reviewHarness.activeStreams),
          )
          .toBe(0);
        expect(
          await this.page.evaluate(() => window.reviewHarness.errors),
        ).toEqual([]);
      }

      expect(this.errors).toEqual([]);
    } finally {
      await this.page.unrouteAll({ behavior: "wait" });
      await this.local.data.close();
      await this.local.store.close();
      rmSync(this.directory, { recursive: true, force: true });
    }
  }
}
