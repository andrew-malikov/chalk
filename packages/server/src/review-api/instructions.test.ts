import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ReviewApiClient } from "@chalk/review-contracts";
import {
  INSTRUCTION_TOPICS,
  instructionsQuerySchema,
  renderInstructions,
} from "@review/node/review-api/instructions.js";
import { ReviewStore } from "@review/node/review-api/store.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createReviewApi } from "./http.js";

describe("renderInstructions", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "review-instructions-"));
    await mkdir(path.join(root, "instructions"));
    await Promise.all(
      Object.entries({
        authoring: "AUTHORING_WORKFLOW",
        "file-lenses": "LENS_GUIDANCE",
      }).map(([name, content]) =>
        writeFile(path.join(root, "instructions", `${name}.md`), content),
      ),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("loads every packaged topic as standalone guidance", async () => {
    for (const topic of INSTRUCTION_TOPICS) {
      const guidance = await renderInstructions(topic);

      expect(guidance.trim().length).toBeGreaterThan(0);
      expect(guidance.trimStart().startsWith("---")).toBe(false);
      expect(guidance).not.toMatch(
        /\]\((?!https?:\/\/|review-source:|#)[^)]+\.md(?:#[^)]*)?\)/,
      );
    }
  });

  it("serves other fixed topics without Desktop", async () => {
    for (const [topic, marker] of [["file-lenses", "LENS_GUIDANCE"]] as const) {
      expect(await renderInstructions(topic, root)).toBe(marker);
    }
  });

  it("accepts only named topics, defaulting to authoring", () => {
    expect(instructionsQuerySchema.parse({})).toEqual({ topic: "authoring" });

    for (const topic of INSTRUCTION_TOPICS) {
      expect(instructionsQuerySchema.parse({ topic })).toEqual({ topic });
    }

    expect(
      instructionsQuerySchema.safeParse({ topic: "../secrets" }).success,
    ).toBe(false);
    expect(
      instructionsQuerySchema.safeParse({
        topic: "authoring",
        file: "secret.md",
      }).success,
    ).toBe(false);
  });
});

describe("review_get_instructions", () => {
  const stores: ReviewStore[] = [];

  afterEach(() => {
    for (const store of stores) store.close();
    stores.length = 0;
  });

  const api = (desktopAvailable = false) => {
    const store = new ReviewStore(":memory:", {
      validatePins: async () => {},
      validateSource: async () => {},
      validateResource: async () => {},
    });

    stores.push(store);

    const app = createReviewApi(
      store,
      undefined,
      desktopAvailable
        ? async () => ({ softwareMapEnabled: false })
        : undefined,
      () => ({ desktopAvailable, softwareMapEnabled: false }),
    );

    const client = new ReviewApiClient(
      {
        serverUrl: "http://review.test",
        token: "test",
      },
      async (url, init) => app.request(url.replace("/reviews-api", ""), init),
    );

    return { app, client };
  };

  it("serves the workflow and rejects invalid or extra query fields with 400", async () => {
    const { app, client } = api();

    const guidance = await client.read("/instructions");

    expect(guidance).toBe(
      await renderInstructions("authoring"),
    );
    expect(guidance).toBe(await client.read("/instructions?topic=authoring"));
    expect(await client.read("/instructions?topic=file-lenses")).toBe(
      await renderInstructions("file-lenses"),
    );

    for (const query of [
      "topic=../../etc/passwd",
      "topic=authoring&file=secret.md",
    ]) {
      const response = await app.request(`/instructions?${query}`);
      expect(response.status).toBe(400);
    }
  });

  it("lists tools and serves instructions without querying renderer capabilities", async () => {
    const store = new ReviewStore(":memory:", {
      validatePins: async () => {},
      validateSource: async () => {},
      validateResource: async () => {},
    });

    try {
      const app = createReviewApi(
        store,
        undefined,
        async () => ({ softwareMapEnabled: false }),
        async () => {
          throw new Error("renderer unavailable");
        },
      );

      expect((await app.request("/authoring")).status).toBe(200);

      for (const topic of INSTRUCTION_TOPICS) {
        const instructions = await app.request(`/instructions?topic=${topic}`);
        expect(instructions.status).toBe(200);
      }
    } finally {
      store.close();
    }
  });

  it("rejects the retired trace instruction topic", async () => {
    const store = new ReviewStore(":memory:", {
      validatePins: async () => {},
      validateSource: async () => {},
      validateResource: async () => {},
    });

    try {
      const app = createReviewApi(store);
      expect(
        (await app.request("/instructions?topic=trace-archaeology")).status,
      ).toBe(400);
    } finally {
      await store.close();
    }
  });
});
