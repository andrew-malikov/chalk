import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { createShareFixture } from "../../test/fixtures/share/create.js";
import { digestBytes, exportShare } from "./export.js";
import { SharedReviewStore, validateShareBundle } from "./import.js";

it("retains the document, images and maps without copying repository files or diff lists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sharing-bundle-"));
  const fixture = await createShareFixture(root);

  try {
    const bundle = await exportShare(fixture);
    const parsed = validateShareBundle(bundle);
    expect(parsed.snapshot.pins).toEqual(
      fixture.store.read(fixture.reviewId).pins,
    );
    expect(bundle.manifest.repository).toEqual(fixture.repository);

    const declared = new Set([
      bundle.manifest.snapshot,
      bundle.manifest.presentation,
      ...bundle.manifest.resources.map((resource) => resource.object),
    ]);

    expect([...bundle.objects.keys()].sort()).toEqual([...declared].sort());
    expect(
      bundle.manifest.resources.map((resource) => resource.kind).sort(),
    ).toEqual(["image", "map"]);

    expect(Object.keys(parsed.presentation.maps)).toHaveLength(1);
    expect(parsed.presentation).not.toHaveProperty("diffs");
    expect(parsed.presentation).not.toHaveProperty("commits");
    expect(bundle.manifest).not.toHaveProperty("files");
    const corrupt = { ...bundle, objects: new Map(bundle.objects) };
    corrupt.objects.set(bundle.manifest.snapshot, Buffer.from("tampered"));
    expect(() => validateShareBundle(corrupt)).toThrow("corrupt");
  } finally {
    await fixture.data.close();
    await fixture.store.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects cached retired manifests before reading their missing resource objects", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sharing-retired-"));
  const fixture = await createShareFixture(root);

  try {
    const bundle = await exportShare(fixture);
    const shared = new SharedReviewStore(path.join(root, "shared"));
    const id = "shared-" + "a".repeat(64);
    await mkdir(path.join(root, "shared", id), { recursive: true });
    const manifest = JSON.parse(JSON.stringify(bundle.manifest));
    manifest.resources[0].kind = "trace";
    await writeFile(
      path.join(root, "shared", id, "manifest.json"),
      JSON.stringify(manifest),
    );

    await expect(
      new SharedReviewStore(path.join(root, "shared")).read(id),
    ).rejects.toThrow(/image|map/);
  } finally {
    await fixture.data.close();
    await fixture.store.close();
    await rm(root, { recursive: true, force: true });
  }
});
