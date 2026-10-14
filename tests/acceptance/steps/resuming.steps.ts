import { expect } from "@playwright/test";

import { Given, Then, When } from "../support/fixtures";
import { openCommitDiff } from "./navigation.steps";

Given(
  "I selected the {string} view in a review",
  async ({ review, page }, view: string) => {
    await review.open();
    await page.getByRole("button", { name: view, exact: true }).click();
  },
);

When("I leave the review and reopen it", async ({ review }) => {
  await review.open();
});

Given(
  "I selected the {string} lens on version {int}",
  async ({ review, page }, title: string, version: number) => {
    await review.open(version);
    await page.getByRole("button", { name: "Diff", exact: true }).click();

    const lens = page
      .getByRole("button")
      .filter({ has: page.getByText(title, { exact: true }) });

    await lens.click();
    await expect(lens).toHaveAttribute("aria-pressed", "true");
  },
);

Given("version {int} is available", async ({ review }, version: number) => {
  review.addVersion(version);
});

When(
  "I leave the review and (re)open version {int}",
  async ({ review }, version: number) => {
    await review.open(version);
  },
);

Then("the {string} lens is selected", async ({ page }, title: string) => {
  const lens = page
    .getByRole("button")
    .filter({ has: page.getByText(title, { exact: true }) });

  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("aria-pressed", "true");
});

Then("no lens is selected", async ({ page }) => {
  await expect(page.getByText("API changes", { exact: true })).toBeVisible();
  await expect(
    page.locator('[aria-label="Lenses"] button[aria-pressed="true"]'),
  ).toHaveCount(0);
});

Given(
  "I am viewing the diff for {string} on version {int}",
  async ({ review, page }, subject: string, version: number) => {
    await review.open(version);
    await openCommitDiff(page, subject);
  },
);

Given(
  "version {int} has no commit named {string}",
  async ({ review, page }, version: number, subject: string) => {
    await expect(page.locator(".review-diff-view--scoped")).toContainText(
      subject,
    );
    review.addVersion(version, false);
  },
);
