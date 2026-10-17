import { type Page, expect } from "@playwright/test";
import type { DataTable } from "playwright-bdd";

import { Given, Then, When } from "../support/fixtures";

const panel = (page: Page) =>
  page.getByRole("complementary", { name: "Comments", exact: true });

const editor = (page: Page) => page.getByRole("textbox").last();

async function showDiscussions(page: Page) {
  if (!(await panel(page).isVisible()))
    await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(panel(page)).toBeVisible();
}

async function postDraft(page: Page) {
  const completed = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/(gitlab\/post|comments\/save)$/.test(new URL(response.url()).pathname),
  );

  await page.getByRole("button", { name: "Post", exact: true }).last().click();
  await completed;
}

Given(
  "a current GitLab review with an open discussion",
  async ({ gitlabReview }) => {
    await gitlabReview.setup();
  },
);

When(
  "I write a(n) {string} draft saying {string}",
  async ({ page, gitlabReview }, kind: string, text: string) => {
    if (kind === "inline") {
      await page.getByRole("button", { name: "Diff", exact: true }).click();

      const line = page
        .locator(
          'diffs-container [data-additions] [data-line="2"][data-line-type]',
        )
        .first();

      await expect(line).toBeVisible();
      await line.evaluate((line) => {
        document
          .getSelection()!
          .setBaseAndExtent(line, 0, line, line.childNodes.length);
        document.dispatchEvent(new Event("selectionchange"));
      });
      await page.getByRole("button", { name: "Comment", exact: true }).click();
    } else {
      await showDiscussions(page);
      await panel(page)
        .getByRole("button", {
          name: kind === "reply" ? "Reply" : "New comment",
          exact: true,
        })
        .click();
    }

    await page.locator('[role="textbox"]:focus').fill(text);

    if (!gitlabReview.saveUnavailable) {
      await expect
        .poll(async () =>
          (await gitlabReview.state()).comments.some(
            (draft) => draft.text === text,
          ),
        )
        .toBe(true);
    }
  },
);

When(
  "I reopen the GitLab review after restarting storage",
  async ({ gitlabReview }) => {
    await gitlabReview.restart();
  },
);

Then(
  "the {string} draft still says {string} at its original target",
  async ({ page, gitlabReview }, kind: string, text: string) => {
    await expect(panel(page).getByRole("textbox")).toHaveText(text);

    const draft = (await gitlabReview.state()).comments.find(
      (draft) => draft.text === text,
    );

    const state = await gitlabReview.state();
    expect(draft?.status).toBe("saved");

    if (kind === "general") expect(draft?.target).toEqual({ kind: "general" });
    else if (kind === "reply")
      expect(draft?.target).toEqual({ kind: "reply", discussionId: "thread" });
    else
      expect(draft?.target).toMatchObject({
        kind: "inline",
        position: {
          baseSha: state.gitlab!.refs.baseSha,
          headSha: state.gitlab!.refs.headSha,
          oldPath: "code.ts",
          newPath: "code.ts",
          side: "head",
          from: 2,
          to: 2,
        },
      });
  },
);

Given("draft saving is unavailable", async ({ gitlabReview }) => {
  gitlabReview.saveUnavailable = true;
});

When("I try to post the draft", async ({ page }) => {
  await postDraft(page);
});

Then(
  "the editor retains {string} and reports an unsaved draft",
  async ({ page, gitlabReview }, text: string) => {
    await expect(editor(page)).toHaveText(text);
    await expect(panel(page).getByRole("status")).toContainText("Unsaved");
    await expect(panel(page).getByRole("alert").first()).toContainText(
      "Draft storage unavailable",
    );
    expect((await gitlabReview.state()).comments).toEqual([]);
  },
);

Then("no comment has been sent to GitLab", async ({ gitlabReview }) => {
  expect(gitlabReview.attempts).toEqual([]);
  expect(gitlabReview.received).toEqual([]);
});

When(
  "draft saving recovers and I retry saving",
  async ({ page, gitlabReview }) => {
    gitlabReview.saveUnavailable = false;
    await panel(page)
      .getByRole("button", { name: "Retry save", exact: true })
      .click();
  },
);

Then(
  "{string} is saved locally",
  async ({ page, gitlabReview }, text: string) => {
    await expect
      .poll(
        async () =>
          (await gitlabReview.state()).comments.find(
            (draft) => draft.text === text,
          )?.status,
      )
      .toBe("saved");
    await expect(panel(page).getByRole("status")).toContainText(
      "Saved locally",
    );
  },
);

When(
  "I replace the draft with {string} and immediately post it",
  async ({ page }, text: string) => {
    await editor(page).fill(text);
    await postDraft(page);
  },
);

Then(
  "GitLab has received exactly these comments:",
  async ({ gitlabReview }, table: DataTable) => {
    const expected = table.hashes().map((row) => row.text);
    await expect.poll(() => gitlabReview.received).toEqual(expected);
  },
);

Then("no local drafts remain to post", async ({ page, gitlabReview }) => {
  await expect
    .poll(async () =>
      (await gitlabReview.state()).comments.filter(
        (draft) => draft.status !== "sent",
      ),
    )
    .toEqual([]);
  await expect(panel(page).getByRole("textbox")).toHaveCount(0);
  await expect(
    panel(page).getByRole("button", { name: "Post all", exact: true }),
  ).toBeDisabled();
});

Given(
  "GitLab will reject {string} once",
  async ({ gitlabReview }, text: string) => {
    gitlabReview.rejectOnce = text;
  },
);

When("I post all drafts( again)", async ({ page }) => {
  const completed = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/gitlab/post"),
  );

  await panel(page)
    .getByRole("button", { name: "Post all", exact: true })
    .click();
  await completed;
  await expect(
    panel(page).getByRole("button", { name: "New comment", exact: true }),
  ).toBeEnabled();
});

Then(
  "{string} is sent and {string} remains as a failed draft",
  async ({ page, gitlabReview }, sent: string, failed: string) => {
    const state = await gitlabReview.state();
    expect(state.comments.find((draft) => draft.text === sent)?.status).toBe(
      "sent",
    );
    expect(state.comments.find((draft) => draft.text === failed)?.status).toBe(
      "failed",
    );
    await expect(panel(page).getByRole("textbox")).toHaveText(failed);
    await expect(panel(page).getByRole("status")).toContainText("Post failed");
  },
);

Given("GitLab will not confirm the next post", async ({ gitlabReview }) => {
  gitlabReview.uncertainNextPost = true;
});

When("I post the draft( again)", async ({ page }) => {
  await postDraft(page);
});

Then(
  "the draft requires verification and cannot be posted again",
  async ({ page, gitlabReview }) => {
    await expect(panel(page).getByRole("status")).toContainText(
      "Unconfirmed post",
    );
    await expect(
      panel(page).getByRole("button", { name: "Post", exact: true }),
    ).toHaveCount(0);
    await expect(
      panel(page).getByRole("button", { name: "Post all", exact: true }),
    ).toBeDisabled();
    await expect(
      panel(page).getByRole("button", {
        name: "Not posted · allow retry",
        exact: true,
      }),
    ).toBeDisabled();
    const state = await gitlabReview.state();
    expect(state.comments[0]?.status).toBe("uncertain");
    await gitlabReview.retryUncertainPost();
    expect(gitlabReview.attempts).toEqual(["Uncertain comment"]);
  },
);

When(
  "I verify that the comment was {string}",
  async ({ page }, outcome: string) => {
    await panel(page)
      .getByRole("checkbox", {
        name: "I checked this MR on GitLab and verified the outcome",
        exact: true,
      })
      .check();

    if (outcome === "posted") {
      await panel(page)
        .getByRole("spinbutton", { name: "Posted note ID", exact: true })
        .fill("501");
      await panel(page)
        .getByRole("button", { name: "Mark as sent", exact: true })
        .click();
    } else
      await panel(page)
        .getByRole("button", { name: "Not posted · allow retry", exact: true })
        .click();
  },
);

Then(
  "the verified draft is {string} without another posting attempt",
  async ({ page, gitlabReview }, state: string) => {
    await expect
      .poll(async () => (await gitlabReview.state()).comments[0]?.status)
      .toBe(state === "sent" ? "sent" : "saved");
    expect(gitlabReview.attempts).toEqual(["Uncertain comment"]);

    if (state === "sent") {
      expect((await gitlabReview.state()).comments[0]?.noteId).toBe(501);
      await expect(panel(page).getByRole("textbox")).toHaveCount(0);
    } else
      await expect(
        panel(page).getByRole("button", { name: "Post", exact: true }),
      ).toBeEnabled();
  },
);

When(
  "the merge request receives {string}",
  async ({ gitlabReview }, change: string) => {
    gitlabReview.advance(change);
  },
);

When("I refresh the GitLab review", async ({ page }) => {
  await showDiscussions(page);

  const completed = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/gitlab/refresh"),
  );

  await panel(page)
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await completed;
  await expect(
    panel(page).getByRole("button", { name: "New comment", exact: true }),
  ).toBeEnabled();
});

Then(
  "the inline draft is {string} and retains {string}",
  async ({ page, gitlabReview }, result: string, text: string) => {
    const draft = (await gitlabReview.state()).comments.find(
      (draft) => draft.text === text,
    );

    expect(draft?.target.kind).toBe("inline");

    if (draft?.target.kind !== "inline")
      throw new Error("Expected an inline draft");
    await expect(panel(page).getByRole("textbox")).toHaveText(text);

    if (result === "moved to line 3") {
      expect(draft.target.unmapped).toBe(false);
      expect(draft.target.position).toMatchObject({
        newPath: "code.ts",
        from: 3,
        to: 3,
      });
      await expect(panel(page).getByRole("textbox")).toHaveAccessibleName(
        "code.ts:3 · head",
      );
      await expect(
        panel(page).getByRole("button", { name: "Post", exact: true }),
      ).toBeEnabled();
    } else {
      expect(draft.target.unmapped).toBe(true);
      await expect(
        panel(page).getByText(/Code could not be mapped/),
      ).toBeVisible();
      await expect(
        panel(page).getByRole("button", { name: "Post", exact: true }),
      ).toBeDisabled();
    }
  },
);

When(
  "I open an older version of the GitLab review",
  async ({ gitlabReview }) => {
    await gitlabReview.openHistorical();
  },
);

Then("GitLab editing and posting controls are disabled", async ({ page }) => {
  for (const name of [
    "New comment",
    "Post all",
    "Post",
    "Discard",
    "Refresh",
    "Reply",
    "Resolve",
  ]) {
    await expect(
      panel(page).getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  }

  await expect(panel(page).getByRole("textbox")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

Then(
  "the API rejects these historical actions without changing feedback:",
  async ({ gitlabReview }, table: DataTable) => {
    const before = await gitlabReview.state();

    for (const { action } of table.hashes()) {
      const response = await gitlabReview.historicalAction(action!);
      expect(response.status, action).toBe(409);
      expect(await response.json(), action).toMatchObject({
        error: expect.stringContaining("Historical reviews cannot"),
      });
      expect(await gitlabReview.state()).toEqual(before);
    }

    expect(gitlabReview.attempts).toEqual([]);
  },
);

When("the GitLab posting account changes", async ({ gitlabReview }) => {
  gitlabReview.changeAccount();
});

Then(
  "posting stops and identifies the account change",
  async ({ page, gitlabReview }) => {
    await expect(panel(page).getByRole("alert").first()).toContainText(
      "posting account changed",
    );
    expect((await gitlabReview.state()).comments[0]?.status).toBe("saved");
  },
);
