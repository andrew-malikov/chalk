import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { type Page, expect } from "@playwright/test";
import type { z } from "zod";

import { openLocalReviewStore } from "../../../packages/review/src/node/review-api/local-data";
import type { ReviewProgress } from "../../../packages/review/src/node/review-api/review-progress";
import type { commandSchema } from "../../../packages/review/src/node/review-api/store";
import { createReviewApi } from "../../../packages/server/src/review-api/http";

export class StoredReview {
  private readonly directory = mkdtempSync(
    path.join(tmpdir(), "chalk-acceptance-"),
  );
  private readonly repository = path.join(this.directory, "repository");
  private readonly database = path.join(this.directory, "reviews.db");
  private local = openLocalReviewStore(this.database, {
    manageWorkspaces: false,
  });
  private api = createReviewApi(this.local.store, this.local.data);
  private reviewId = "";
  private base = "";
  failNextSave = false;

  constructor(private readonly page: Page) {}

  private git(...args: string[]) {
    return execFileSync("git", args, {
      cwd: this.repository,
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
    this.git(
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-qm",
      subject,
    );

    return this.git("rev-parse", "HEAD");
  }

  private command(operation: z.input<typeof commandSchema>["operation"]) {
    return this.local.store.execute({ commandId: randomUUID(), operation });
  }

  async setup() {
    mkdirSync(this.repository);
    this.git("init", "-q", "-b", "main");
    this.git("config", "user.name", "Acceptance Test");
    this.git("config", "user.email", "acceptance@example.invalid");
    writeFileSync(path.join(this.repository, "api.ts"), "// API\n");
    this.base = this.commit("Base");
    writeFileSync(
      path.join(this.repository, "api.ts"),
      "// API\nexport const validate = true;\nexport const handle = true;\nexport const route = true;\n",
    );
    writeFileSync(path.join(this.repository, "notes.md"), "Review notes\n");
    const head = this.commit("Add API and notes");
    const repository = await this.local.data.register(this.repository);

    const created = await this.command({
      type: "create",
      title: "Review progress",
      pins: { repositoryId: repository.id, base: this.base, head },
    });

    this.reviewId = created.reviewId;
    await this.command({
      type: "lens_edit",
      reviewId: this.reviewId,
      edit: {
        type: "insert",
        title: "API",
        targets: [{ kind: "files", patterns: ["api.ts"] }],
      },
    });
    await this.command({
      type: "lens_edit",
      reviewId: this.reviewId,
      edit: {
        type: "insert",
        title: "Validation",
        targets: [
          {
            kind: "ranges",
            sources: [
              {
                file: "api.ts",
                start: { side: "head", line: 2 },
                end: { side: "head", line: 2 },
              },
            ],
          },
        ],
      },
    });
    await this.command({
      type: "lens_edit",
      reviewId: this.reviewId,
      edit: {
        type: "insert",
        title: "Missing files",
        targets: [{ kind: "files", patterns: ["missing.ts"] }],
      },
    });

    await this.page.route("**/reviews-api/**", async (route) => {
      const request = route.request();

      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname.endsWith("/progress") &&
        this.failNextSave
      ) {
        this.failNextSave = false;
        await route.fulfill({
          status: 409,
          json: { error: "Progress save unavailable. Try again." },
        });

        return;
      }

      const url = new URL(request.url());

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

  async open() {
    // Finish comparison acquisition before mounting: these scenarios test completed progress.
    const snapshot = this.local.store.read(this.reviewId);
    await this.local.data.coverage(this.reviewId, snapshot.pins!, "textual");
    await this.page.evaluate(
      (snapshot) => window.reviewHarness.openStored(JSON.parse(snapshot)),
      JSON.stringify(snapshot),
    );
    await this.page.getByRole("button", { name: "Diff", exact: true }).click();
    await expect(
      this.page
        .getByRole("checkbox", { name: "Mark viewed: API", exact: true })
        .or(
          this.page.getByRole("checkbox", {
            name: "Mark unviewed: API",
            exact: true,
          }),
        ),
    ).toBeEnabled();
  }

  async progress(): Promise<ReviewProgress> {
    const response = await this.api.request(
      `/${this.reviewId}/progress?mode=textual`,
    );

    expect(response.status).toBe(200);

    return response.json();
  }

  async restart() {
    await this.page.evaluate(() => window.reviewHarness.close());
    await this.local.data.close();
    await this.local.store.close();
    this.local = openLocalReviewStore(this.database, {
      manageWorkspaces: false,
    });
    this.api = createReviewApi(this.local.store, this.local.data);
    await this.open();
  }

  async repin(change: string) {
    await this.page.evaluate(() => window.reviewHarness.close());
    let base = this.base;

    if (change === "changed head contents") {
      writeFileSync(
        path.join(this.repository, "api.ts"),
        "// API updated\nexport const validate = true;\nexport const handle = true;\nexport const route = true;\n",
      );
    } else if (change === "changed base contents") {
      const head = this.git("rev-parse", "HEAD");
      this.git("checkout", "-q", "--detach", this.base);
      writeFileSync(path.join(this.repository, "api.ts"), "// Previous API\n");
      base = this.commit("Change base context");
      this.git(
        "-c",
        "advice.detachedHead=false",
        "checkout",
        "-q",
        "--detach",
        head,
      );
    } else if (change !== "unchanged file contents") {
      throw new Error(`Unknown pin change: ${change}`);
    }

    const head = this.commit("New pins");
    const snapshot = this.local.store.read(this.reviewId);
    await this.command({
      type: "repin",
      reviewId: this.reviewId,
      pins: { ...snapshot.pins!, base, head },
    });
    await this.open();
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
    } finally {
      await this.page.unrouteAll({ behavior: "wait" });
      await this.local.data.close();
      await this.local.store.close();
      rmSync(this.directory, { recursive: true, force: true });
    }
  }
}
