import { type Page, expect } from "@playwright/test";

import { Given, Then, When } from "../support/fixtures";
import { openDiffNavigation } from "./navigation.steps";

function lensRow(page: Page, title: string) {
  return page.locator('[aria-label="Lenses"] section').filter({
    has: page.getByText(title, { exact: true }),
  });
}

Given(
  "a review with overlapping lenses and uncategorized changes",
  async ({ storedReview }) => {
    await storedReview.setup();
  },
);

When("I select the {string} lens", async ({ page }, title: string) => {
  await openDiffNavigation(page);
  const toggle = lensRow(page, title).getByRole("button", { pressed: false });
  await toggle.click();
  await expect(
    lensRow(page, title).getByRole("button", { pressed: true }),
  ).toBeVisible();
});

When("I clear the selected lens", async ({ page }) => {
  await openDiffNavigation(page);
  await page
    .locator('[aria-label="Lenses"] section')
    .getByRole("button", { pressed: true })
    .click();
  await expect(
    page
      .locator('[aria-label="Lenses"] section')
      .getByRole("button", { pressed: true }),
  ).toHaveCount(0);
});

Then("only {string} is listed in the diff", async ({ page }, file: string) => {
  await openDiffNavigation(page, "Files");
  const files = page.locator(".diff-native-tree:visible").getByRole("treeitem");
  await expect(files).toHaveCount(1);
  await expect(files).toHaveAccessibleName(file);
});

Then(
  "{string} and {string} are listed in the diff",
  async ({ page }, first: string, second: string) => {
    await openDiffNavigation(page, "Files");

    const files = page
      .locator(".diff-native-tree:visible")
      .getByRole("treeitem");

    await expect(files).toHaveCount(2);
    const tree = page.locator(".diff-native-tree:visible");
    await expect(
      tree.getByRole("treeitem", { name: first, exact: true }),
    ).toBeVisible();
    await expect(
      tree.getByRole("treeitem", { name: second, exact: true }),
    ).toBeVisible();
  },
);

Then(
  "the lens contains only the added line {int} of {string}",
  async ({ storedReview, page }, line: number, file: string) => {
    const progress = await storedReview.progress();
    await openDiffNavigation(page);

    const selected = page
      .locator('[aria-label="Lenses"] section')
      .filter({ has: page.getByRole("button", { pressed: true }) });

    const id = await selected.getAttribute("data-lens-id");
    expect(progress.lenses.find((lens) => lens.id === id)?.sources).toEqual([
      { file, side: "head", fromLine: line, toLine: line },
    ]);
  },
);

Then(
  "the {string} lens cannot be selected",
  async ({ page }, title: string) => {
    await openDiffNavigation(page);
    await expect(
      lensRow(page, title).getByRole("button", { pressed: false }),
    ).toBeDisabled();
  },
);

When(
  /^I mark the "([^"]+)" lens as (viewed|unviewed)$/,
  async ({ page }, title: string, state: string) => {
    await openDiffNavigation(page);
    const row = lensRow(page, title);
    const box = row.getByRole("checkbox");
    await expect(box).toHaveAttribute(
      "aria-checked",
      state === "viewed" ? /^(false|mixed)$/ : "true",
    );

    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/progress") &&
        response.request().method() === "POST",
    );

    await box.click();
    await saved;
    await expect(box).toBeEnabled();
  },
);

When(
  "I reopen the review after restarting its storage",
  async ({ storedReview }) => {
    await storedReview.restart();
  },
);

Then(
  /^the "([^"]+)" lens is (viewed|partially viewed|unviewed)$/,
  async ({ page }, title: string, state: string) => {
    await openDiffNavigation(page);
    await expect(lensRow(page, title).getByRole("checkbox")).toHaveAttribute(
      "aria-checked",
      state === "viewed"
        ? "true"
        : state === "partially viewed"
          ? "mixed"
          : "false",
    );
  },
);

Then(
  /^"([^"]+)" is (fully viewed|unviewed)$/,
  async ({ storedReview }, path: string, state: string) => {
    const progress = await storedReview.progress();
    const file = progress.files.find((file) => file.path === path);
    expect(file, `Missing progress for ${path}`).toBeDefined();
    expect(file!.viewed).toEqual({
      base: [],
      head: state === "fully viewed" ? [[1, 4]] : [],
    });
  },
);

Then(
  "{int} of the review's {int} changed lines is/are viewed",
  async ({ storedReview, page }, viewed: number, total: number) => {
    const progress = await storedReview.progress();

    const length = (ranges: [number, number][]) =>
      ranges.reduce((sum, [from, to]) => sum + to - from, 0);

    expect(
      progress.files.reduce(
        (sum, file) =>
          sum + length(file.changed.base) + length(file.changed.head),
        0,
      ),
    ).toBe(total);
    expect(
      progress.files.reduce(
        (sum, file) =>
          sum + length(file.viewed.base) + length(file.viewed.head),
        0,
      ),
    ).toBe(viewed);
    await expect(page.getByText("Remaining", { exact: false })).toContainText(
      `+${total - viewed}`,
    );
  },
);

Then(
  "only added lines {int} through {int} of {string} remain viewed",
  async ({ storedReview }, from: number, to: number, path: string) => {
    const progress = await storedReview.progress();
    expect(progress.files.find((file) => file.path === path)?.viewed).toEqual({
      base: [],
      head: [[from - 1, to]],
    });
  },
);

When(
  "I open newer pins with {string}",
  async ({ storedReview }, change: string) => {
    await storedReview.repin(change);
  },
);

Given("the next viewed save will fail", async ({ storedReview }) => {
  storedReview.failNextSave = true;
});

Then("a progress save error is shown", async ({ page }) => {
  await expect(page.getByRole("alert")).toContainText(
    "Progress save unavailable",
  );
});

Then("the progress save error is cleared", async ({ page }) => {
  await expect(
    page.getByRole("alert").filter({ hasText: "Progress save unavailable" }),
  ).toHaveCount(0);
});

When(
  "the file changes without reloading the canvas",
  async ({ storedReview }) => {
    await storedReview.repin("changed head contents", false);
  },
);

Then("the server reports that the displayed file changed", async ({ page }) => {
  await expect(page.getByRole("alert")).toContainText("This file changed");
});

When("I reload the changed review", async ({ storedReview }) => {
  await storedReview.open();
});

When("I close and reopen diff navigation", async ({ page }) => {
  const diff = await page.locator("[data-pierre-diff]:visible").elementHandle();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Lenses" })).toBeHidden();
  expect(await diff?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.locator("[data-pierre-diff]:visible")).toBeVisible();
  await openDiffNavigation(page);
});
