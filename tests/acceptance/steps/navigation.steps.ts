import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { Given, Then, When } from "../support/fixtures";

export async function openCommitDiff(page: Page, subject: string) {
  await page.getByRole("button", { name: "Commits", exact: true }).click();
  await page
    .getByRole("article")
    .filter({ hasText: subject })
    .getByRole("button", { name: "Open commit diff", exact: true })
    .click();
}

Given("a review with changes and commits", async ({ review }) => {
  await review.open();
});

Given(
  "a review containing the commit {string}",
  async ({ review, page }, subject: string) => {
    await review.open();
    await page.getByRole("button", { name: "Commits", exact: true }).click();
    await expect(
      page.getByRole("article").filter({ hasText: subject }),
    ).toBeVisible();
  },
);

When("I select the {string} view", async ({ page }, view: string) => {
  await page.getByRole("button", { name: view, exact: true }).click();
});

Then(
  "the {string} view is displayed and selected",
  async ({ page }, view: string) => {
    await expect(
      page.getByRole("button", { name: view, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    if (view === "Chalk")
      await expect(
        page.getByText("Review overview", { exact: true }),
      ).toBeVisible();
    else if (view === "Commits")
      await expect(
        page.getByRole("article").filter({ hasText: "Add the API" }),
      ).toBeVisible();
    else if (view === "Diff")
      await expect(page.locator(".diff-workspace")).toBeVisible();
    else throw new Error(`Unknown review view: ${view}`);
  },
);

When("I open the diff for {string}", async ({ page }, subject: string) => {
  await openCommitDiff(page, subject);
});

Given(
  "I am viewing the diff for {string}",
  async ({ review, page }, subject: string) => {
    await review.open();
    await openCommitDiff(page, subject);
  },
);

Then(
  "the Diff view is scoped to {string}",
  async ({ page }, subject: string) => {
    await expect(
      page.getByRole("button", { name: "Diff", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".review-diff-view--scoped")).toBeVisible();
    await expect(page.locator(".review-diff-view--scoped")).toContainText(
      subject,
    );
  },
);

Then("the whole review diff is displayed", async ({ page }) => {
  await expect(
    page.getByRole("button", { name: "Diff", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".diff-workspace")).toBeVisible();
  await expect(page.locator(".review-diff-view--scoped")).toHaveCount(0);
});
