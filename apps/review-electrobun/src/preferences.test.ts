import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { createPreferencesStore } from "./preferences";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});

async function file() {
  const root = await mkdtemp(path.join(tmpdir(), "review-prefs-"));
  roots.push(root);

  return path.join(root, "preferences.json");
}

test("serial patches preserve unrelated settings and persist the last state", async () => {
  const target = await file();
  const store = await createPreferencesStore(target);
  await Promise.all([
    store.update({ theme: "dark" }),
    store.update({
      diffLayout: "unified",
      reviewIds: ["r1"],
      activeReviewId: "r1",
    }),
  ]);
  expect(store.get()).toMatchObject({
    theme: "dark",
    diffLayout: "unified",
    reviewIds: ["r1"],
  });
  expect(JSON.parse(await readFile(target, "utf8"))).toEqual(store.get());
});

test("corrupt preferences recover to Home and valid preferences restore", async () => {
  const target = await file();
  await writeFile(target, "corrupt");
  const recovered = await createPreferencesStore(target);
  expect(recovered.get().activeReviewId).toBeNull();
  await recovered.update({
    theme: "light",
    reviewIds: ["r"],
    activeReviewId: "r",
  });
  expect((await createPreferencesStore(target)).get()).toMatchObject({
    theme: "light",
    activeReviewId: "r",
  });
});

test("invalid privileged preference updates never alter stored state", async () => {
  const store = await createPreferencesStore(await file());
  await expect(store.update({ theme: "invalid" as "dark" })).rejects.toThrow(
    Error,
  );
  expect(store.get().theme).toBe("system");
});
