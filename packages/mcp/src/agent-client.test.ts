import { randomUUID } from "node:crypto";
import { PassThrough, Readable, Writable } from "node:stream";

import type { JsonObject } from "@chalk/json";
import { ReviewApiClient } from "@chalk/review-contracts";
import { createReviewApi } from "@chalk/server/review-api/http.js";
import { runReviewAgentCli } from "@cli/agent-cli.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { ReviewStore } from "@review/node/review-api/store.js";
import { afterAll, afterEach, expect, it, vi } from "vitest";

import * as agentClient from "./agent-client.js";
import { type AuthoringTool, callAuthoringTool } from "./agent-client.js";
import { serveReviewMcp } from "./mcp.js";

const store = new ReviewStore(":memory:", {
  validatePins: async () => {},
  validateSource: async () => {},
  validateResource: async () => {},
});

const app = createReviewApi(store);

afterAll(() => store.close());

const client = new ReviewApiClient(
  { serverUrl: "http://review.test", token: "test" },
  async (url, init) => app.request(url.replace("/reviews-api", ""), init),
);

afterEach(async () => {
  // The scratchpad cannot be deleted; every review can.
  for (const { reviewId, kind } of store.list())
    if (kind !== "scratchpad")
      await store.execute({
        commandId: randomUUID(),
        operation: { type: "delete", reviewId },
      });
});

/** Catalog entries that are reviews: listing also makes the scratchpad. */
const reviewsOnly = (entries: { kind?: string }[]) =>
  entries.filter((entry) => entry.kind !== "scratchpad");

it("uses host-advertised tools to edit, retry, reject invalid content and inspect saved IDs", async () => {
  const tools = await client.read<AuthoringTool[]>("/authoring");

  const call = (name: string, args: Parameters<typeof callAuthoringTool>[2]) =>
    callAuthoringTool(
      client,
      tools.find((t) => t.name === `review_${name}`)!,
      args,
    );

  const created = (await call("create", {
    commandId: randomUUID(),
    title: "Authoring",
    pins: { repositoryId: "repo", base: "base", head: "head" },
  })) as { reviewId: string };

  const input = {
    commandId: randomUUID(),
    reviewId: created.reviewId,
    edit: {
      type: "insert",
      content: {
        type: "sequence",
        title: "Save",
        actors: { agent: "Agent", host: "Host" },
        steps: [
          {
            from: "agent",
            to: "host",
            label: "Save",
            explanation: "Validated before saving.",
          },
        ],
      },
    },
  };

  const result = (await call("edit", input)) as { targetId: string };
  expect(await call("edit", input)).toEqual(result);
  expect(store.read(created.reviewId).version).toBe(1);
  expect(
    await call("get", {
      reviewId: created.reviewId,
      targetId: result.targetId,
      format: "json",
    }),
  ).toMatchObject({ type: "sequence", id: result.targetId });
  await expect(
    call("edit", {
      ...input,
      commandId: randomUUID(),
      edit: {
        type: "update",
        targetId: result.targetId,
        changes: { actors: { agent: "Agent" } },
      },
    }),
  ).rejects.toThrow(Error);
  expect(store.read(created.reviewId).version).toBe(1);
  await call("edit", {
    commandId: randomUUID(),
    reviewId: created.reviewId,
    edit: {
      type: "update",
      targetId: result.targetId,
      changes: { title: "Saved" },
    },
  });
  expect(
    await call("get", {
      reviewId: created.reviewId,
      full: true,
      format: "json",
    }),
  ).toMatchObject({
    version: 2,
    document: [{ id: result.targetId, title: "Saved" }],
  });
  expect(
    await call("get", {
      reviewId: created.reviewId,
      version: 1,
      full: true,
      format: "json",
    }),
  ).toMatchObject({ version: 1, document: [{ title: "Save" }] });
  const text = await call("get", { reviewId: created.reviewId, full: true });
  expect(text).toContain(`[${result.targetId}] sequence: Saved`);
  expect(text).toContain("Validated before saving.");
  expect(
    await call("get", { reviewId: created.reviewId, version: 1 }),
  ).toContain("sequence: Save");
  // IDs discovered in the reading view still identify the same editable nodes.
  const stepId = String(text).match(/\[(step-\d+)\]/)![1];
  await call("edit", {
    commandId: randomUUID(),
    reviewId: created.reviewId,
    edit: {
      type: "update",
      targetId: stepId,
      changes: { explanation: "Updated through the reading view." },
    },
  });
  expect(
    await call("get", { reviewId: created.reviewId, targetId: stepId }),
  ).toContain("Updated through the reading view.");
});

it("assigns a command ID and names it when a reply is lost", async () => {
  const tools = await client.read<AuthoringTool[]>("/authoring");

  const tool = (name: string) =>
    tools.find((t) => t.name === `review_${name}`)!;

  let dropReply = false;

  // The host applies the command, then the reply is lost on the way back.
  const lossy = new ReviewApiClient(client.connection, async (url, init) => {
    const response = await app.request(url.replace("/reviews-api", ""), init);

    if (dropReply) {
      dropReply = false;
      throw new TypeError("fetch failed");
    }

    return response;
  });

  const { reviewId } = (await callAuthoringTool(lossy, tool("create"), {
    title: "Minted",
    pins: { repositoryId: "repo", base: "base", head: "head" },
  })) as { reviewId: string };

  const insert = {
    reviewId,
    edit: { type: "insert", content: { type: "markdown", markdown: "Once." } },
  };

  dropReply = true;

  const error = await callAuthoringTool(lossy, tool("edit"), insert).catch(
    (caught: Error) => caught,
  );

  expect(store.read(reviewId).version).toBe(1);

  const commandId = String(error).match(/commandId "([^"]+)"/)![1];

  expect(
    await callAuthoringTool(lossy, tool("edit"), { ...insert, commandId }),
  ).toMatchObject({ reviewId, version: 1 });
  expect(store.read(reviewId).version).toBe(1);
});

it("serves MCP framing without stdout diagnostics and returns host errors as tool errors", async () => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();

  const server = await serveReviewMcp(async () => ({ client }), stdin, stdout);

  let output = "";
  stdout.on("data", (chunk) => {
    output += chunk;
  });

  const request = async <Params>(
    id: number,
    method: string,
    params: Params,
  ) => {
    stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    await expect
      .poll(() =>
        output
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .find((reply) => reply.id === id),
      )
      .toBeTruthy();

    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((reply) => reply.id === id);
  };

  try {
    await request(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    const list = await request(2, "tools/list", {});
    ListToolsResultSchema.parse(list.result);
    // The Anthropic API rejects these at the top level of a tool input schema.
    expect(
      list.result.tools.filter((tool: AuthoringTool) =>
        ["anyOf", "oneOf", "allOf"].some((key) => key in tool.inputSchema),
      ),
    ).toEqual([]);
    expect(
      list.result.tools.find(
        (tool: AuthoringTool) => tool.name === "session_edit",
      ).inputSchema,
    ).toMatchObject({
      type: "object",
      required: ["sessionId", "edit"],
      properties: expect.objectContaining({ commandId: expect.anything() }),
    });

    const error = await request(3, "tools/call", {
      name: "session_get",
      arguments: { sessionId: "missing" },
    });

    expect(error.result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringMatching(/not found/i) }],
    });

    const next = await request(4, "tools/call", {
      name: "session_list",
      arguments: {},
    });

    expect(reviewsOnly(JSON.parse(next.result.content[0].text))).toEqual([]);

    const created = await store.execute({
      commandId: randomUUID(),
      operation: {
        type: "create",
        title: "Readable review",
        pins: { repositoryId: "repo", base: "base", head: "head" },
      },
    });

    const read = await request(5, "tools/call", {
      name: "session_get",
      arguments: { sessionId: created.reviewId },
    });

    expect(read.result.content[0].text.startsWith("# Readable review\n")).toBe(
      true,
    );

    const raw = await request(6, "tools/call", {
      name: "session_get",
      arguments: { sessionId: created.reviewId, full: true, format: "json" },
    });

    expect(JSON.parse(raw.result.content[0].text)).toMatchObject({
      sessionId: created.reviewId,
      document: [],
    });

    const unknown = await request(7, "tools/call", {
      name: "my private notes",
      arguments: {},
    });

    expect(unknown.result.isError).toBe(true);
    expect(unknown.result.content[0].text).toContain("Unknown Chalk tool");
  } finally {
    await server.close();
  }
});

it("shows CLI help without requiring Desktop or touching review storage", async () => {
  let output = "";

  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += chunk;
      done();
    },
  });

  expect(
    await runReviewAgentCli({
      argv: ["api", "--help"],
      stdin: Readable.from([]),
      stdout: stream,
      stderr: stream,
      env: { CHALK_REVIEW_HOME: "/does-not-exist" },
    }),
  ).toBe(0);
  expect(output).toContain("chalk api <tool-name>");
});

it("prints readable CLI output by default and raw objects with --json", async () => {
  const connection = vi
    .spyOn(agentClient, "connectReviewApi")
    .mockResolvedValue(client);

  const created = await store.execute({
    commandId: randomUUID(),
    operation: {
      type: "create",
      title: "CLI reading",
      pins: { repositoryId: "repo", base: "base", head: "head" },
    },
  });

  try {
    const read = async (flags: string[]) => {
      let output = "";

      const stdout = new Writable({
        write(chunk, _encoding, done) {
          output += chunk;
          done();
        },
      });

      expect(
        await runReviewAgentCli({
          argv: [
            "api",
            "session_get",
            JSON.stringify({ sessionId: created.reviewId, full: true }),
            ...flags,
          ],
          stdout,
          stderr: stdout,
        }),
      ).toBe(0);

      return output;
    };

    expect((await read([])).startsWith("# CLI reading\n")).toBe(true);
    expect(JSON.parse(await read(["--json"]))).toMatchObject({
      sessionId: created.reviewId,
      document: [],
    });
  } finally {
    connection.mockRestore();
  }
});

it("repins existing content through the host-advertised tool", async () => {
  const tools = await client.read<AuthoringTool[]>("/authoring");

  const created = await store.execute({
    commandId: randomUUID(),
    operation: {
      type: "create",
      title: "Source review",
      pins: { repositoryId: "repo", base: "base", head: "head" },
    },
  });

  await store.execute({
    commandId: randomUUID(),
    operation: {
      type: "edit",
      reviewId: created.reviewId,
      edit: {
        type: "insert",
        content: { type: "markdown", markdown: "Keep the authored review" },
      },
    },
  });

  const authored = store.read(created.reviewId).document;

  await callAuthoringTool(
    client,
    tools.find((tool) => tool.name === "review_repin")!,
    {
      commandId: randomUUID(),
      reviewId: created.reviewId,
      pins: { repositoryId: "repo", base: "base", head: "next-head" },
    },
  );
  expect(store.read(created.reviewId).document).toEqual(authored);
  expect(store.read(created.reviewId).pins?.head).toBe("next-head");
});

it("keeps an MCP session on the instance key it first reached", async () => {
  const keys: (string | undefined)[] = [];

  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let output = "";
  stdout.on("data", (chunk) => {
    output += chunk;
  });

  const server = await serveReviewMcp(
    async (key) => {
      keys.push(key);

      return { client, instance: { key: "preview" } };
    },
    stdin,
    stdout,
    process.stderr,
    async (problem) => ({ desktopAvailable: false, problem }),
  );

  const reply = async (id: number, method: string, params: JsonObject) => {
    stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    let found: { result: { isError?: boolean; content?: { text: string }[] } };
    await expect
      .poll(() => {
        found = output
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .find((line) => line.id === id);

        return found;
      })
      .toBeTruthy();

    return found!.result;
  };

  try {
    await reply(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    await reply(2, "tools/list", {});

    const result = await reply(3, "tools/call", {
      name: "session_list",
      arguments: {},
    });

    // Every connect after the first names the latched key, so a Desktop that
    // restarts under the same key is followed and another key is never chosen.
    expect(keys).toEqual([undefined, "preview"]);
    expect(result.isError).toBeFalsy();
  } finally {
    await server.close();
  }
});
