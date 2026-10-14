import { reviewDevInstanceKey } from "@review/node/storage/review-home-paths";
import { expect, test } from "vitest";

import { reviewInstanceIdentity } from "./desktop-discovery";

test("separate desktop shells can select distinct dev keys for the same checkout", () => {
  const checkout = "/tmp/review-checkout";
  expect(reviewInstanceIdentity({ CHALK_REVIEW_CHECKOUT: checkout }).key).toBe(
    reviewDevInstanceKey(checkout),
  );
  expect(
    reviewInstanceIdentity({
      CHALK_REVIEW_CHECKOUT: checkout,
      CHALK_REVIEW_INSTANCE_KEY: "dev-electrobun-example",
    }),
  ).toMatchObject({ key: "dev-electrobun-example", channel: "dev", checkout });
});

test.each(["../outside", "stable", "dev-../../outside"])(
  "rejects unsafe or non-dev override %s",
  (key) => {
    expect(() =>
      reviewInstanceIdentity({
        CHALK_REVIEW_CHECKOUT: "/tmp/review",
        CHALK_REVIEW_INSTANCE_KEY: key,
      }),
    ).toThrow(Error);
  },
);

test("a release cannot override the default development identity", () => {
  expect(() =>
    reviewInstanceIdentity({
      CHALK_REVIEW_INSTANCE_KEY: "dev-electrobun-example",
    }),
  ).toThrow(Error);
  expect(reviewInstanceIdentity({}).key).toBe("stable");
});
