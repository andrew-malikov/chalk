import { expect } from "@playwright/test";
import { test as base, createBdd } from "playwright-bdd";

import type { ReviewHarness } from "../harness/review";
import { GitLabReview } from "./gitlab-review";
import { StoredReview } from "./stored-review";

interface AcceptanceReview {
  open(version?: number): Promise<void>;
  close(): Promise<void>;
  addVersion(version: number, includeCommit?: boolean): void;
}

export const test = base.extend<{
  review: AcceptanceReview;
  storedReview: StoredReview;
  gitlabReview: GitLabReview;
}>({
  gitlabReview: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const review = new GitLabReview(page);

    try {
      await use(review);
    } finally {
      await review.dispose();
      expect(errors).toEqual([]);
    }
  },
  storedReview: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const review = new StoredReview(page);

    try {
      await use(review);
    } finally {
      await review.dispose();
      expect(errors).toEqual([]);
    }
  },
  review: async ({ page }, use) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/");
    await page.waitForFunction(() => !!window.reviewHarness);
    const versions = new Map([[3, true]]);
    let currentVersion = 3;

    const close = async () => {
      await page.evaluate(() => window.reviewHarness.close());
      await expect
        .poll(() => page.evaluate(() => window.reviewHarness.activeStreams))
        .toBe(0);
    };

    try {
      await use({
        close,
        addVersion(version, includeCommit = true) {
          versions.set(version, includeCommit);
        },
        async open(version = currentVersion) {
          const includeCommit = versions.get(version);

          if (includeCommit === undefined)
            throw new Error(`Unknown review version: ${version}`);
          await close();
          currentVersion = version;
          await page.evaluate(
            ({ version, includeCommit }) => {
              window.reviewHarness.open(version, includeCommit);
            },
            { version, includeCommit },
          );
          await expect(
            page.getByRole("group", { name: "Session views" }),
          ).toBeVisible();
        },
      });
    } finally {
      await close();
      await expect(
        page.evaluate(() => window.reviewHarness.errors),
      ).resolves.toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  },
});

export const { Given, When, Then } = createBdd(test);
