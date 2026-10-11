import { bundleReviewSoftwareMap } from "@review/software-map/software-map-bundle";
import { defineSoftwareMap } from "@review/software-map/software-map-model";
import { describe, expect, it } from "vitest";

import { mapResourcesFromBundle } from "./legacy-resources";

describe("mapResourcesFromBundle", () => {
  it("produces one map resource per side in the store's saved shape", () => {
    const model = defineSoftwareMap({
      systems: {
        s: {
          label: "S",
          containers: {
            c: {
              label: "C",
              components: { k: { label: "K", coverage: { files: ["a.ts"] } } },
            },
          },
        },
      },
    });

    const bundle = bundleReviewSoftwareMap({
      head: model,
      base: model,
      headCommit: "b".repeat(40),
      baseCommit: "a".repeat(40),
    });

    const resources = mapResourcesFromBundle(bundle);
    expect(resources.map((resource) => resource.side)).toEqual([
      "base",
      "head",
    ]);
    const saved = JSON.parse(resources[1]!.json);
    expect(saved).toMatchObject({ commit: "b".repeat(40), side: "head" });
    expect(Array.isArray(saved.elements)).toBe(true);
    expect(Array.isArray(saved.relationships)).toBe(true);
  });
});
