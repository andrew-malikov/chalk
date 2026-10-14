import { PassThrough } from "node:stream";

import { ReviewApiClient } from "@blackboard/review-contracts";
import { createReviewApi } from "@blackboard/server/review-api/http.js";
import { ReviewStore } from "@review/node/review-api/store.js";
import { describe, expect, it } from "vitest";

import { serveReviewMcp } from "./mcp.js";

async function startMcp(connect: () => Promise<ReviewApiClient>) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  const server = await serveReviewMcp(
    async () => ({ client: await connect() }),
    stdin,
    stdout,
    stderr,
  );

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

  return { request, close: () => server.close() };
}

const initialize = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test", version: "1" },
};

describe("blackboard mcp instructions", () => {
  it("lists and answers while down, then serves guidance through a restart", async () => {
    let up = false;
    let connections = 0;

    const store = new ReviewStore(":memory:", {
      validatePins: async () => {},
      validateSource: async () => {},
      validateResource: async () => {},
    });

    const app = createReviewApi(store);

    const client = new ReviewApiClient(
      {
        serverUrl: "http://review.test",
        token: "test",
      },
      async (url, init) => app.request(url.replace("/reviews-api", ""), init),
    );

    const mcp = await startMcp(async () => {
      connections++;

      if (!up) throw new Error("No Blackboard Desktop server is ready.");

      return client;
    });

    try {
      expect(connections).toBe(0);

      const init = await mcp.request(1, "initialize", initialize);
      expect(init.result.instructions).toBeUndefined();
      const list = await mcp.request(2, "tools/list", {});
      expect(
        list.result.tools.map((tool: { name: string }) => tool.name),
      ).toEqual(["session_get_instructions", "blackboard_status"]);
      const guidance = list.result.tools[0].description;
      expect(guidance).toContain("session_get_instructions");
      expect(guidance).toContain('topic:"scratchpad"');

      const down = await mcp.request(3, "tools/call", {
        name: "session_get_instructions",
        arguments: {},
      });

      expect(down.result.isError).toBeFalsy();
      expect(down.result.content[0].text).toMatch(/^Blackboard is not running/);

      up = true;

      const live = await mcp.request(4, "tools/call", {
        name: "session_get_instructions",
        arguments: {},
      });

      expect(live.result.content[0].text).toContain("rfc-style blackboard");
      const liveList = await mcp.request(5, "tools/list", {});
      expect(liveList.result.tools[0].name).toBe("session_get_instructions");
      const preamble = guidance.split("\n\n")[0];
      expect(liveList.result.tools[0].description).toContain(preamble);

      for (const tool of liveList.result.tools.slice(1))
        expect(tool.description).not.toContain(preamble);
      expect(
        liveList.result.tools.filter(
          (tool: { name: string }) => tool.name === "session_get_instructions",
        ),
      ).toHaveLength(1);

      up = false;

      const restartedDown = await mcp.request(6, "tools/call", {
        name: "session_get_instructions",
        arguments: {},
      });

      expect(restartedDown.result.content[0].text).toMatch(
        /^Blackboard is not running/,
      );
      up = true;

      const restarted = await mcp.request(7, "tools/call", {
        name: "session_get_instructions",
        arguments: { topic: "file-lenses" },
      });

      expect(restarted.result.content[0].text).toContain("lens");
    } finally {
      await mcp.close();
      store.close();
    }
  });

  it("tells a session that listed tools while down to reload them", async () => {
    let up = false;

    const store = new ReviewStore(":memory:", {
      validatePins: async () => {},
      validateSource: async () => {},
      validateResource: async () => {},
    });

    const app = createReviewApi(store);

    const client = new ReviewApiClient(
      {
        serverUrl: "http://review.test",
        token: "test",
      },
      async (url, init) => app.request(url.replace("/reviews-api", ""), init),
    );

    const mcp = await startMcp(async () => {
      if (!up) throw new Error("No Blackboard Desktop server is ready.");

      return client;
    });

    const instructions = async (id: number) =>
      (
        await mcp.request(id, "tools/call", {
          name: "session_get_instructions",
          arguments: {},
        })
      ).result.content[0].text as string;

    try {
      await mcp.request(1, "initialize", initialize);
      await mcp.request(2, "tools/list", {});

      up = true;

      const stale = await instructions(3);
      expect(stale).toMatch(/^Blackboard is running now/);
      expect(stale).toContain("reload");
      expect(stale).toContain("rfc-style blackboard");

      await mcp.request(4, "tools/list", {});

      expect(await instructions(5)).not.toMatch(/^Blackboard is running now/);
    } finally {
      await mcp.close();
      store.close();
    }
  });

  it("uses the live scratchpad catalog description and preserves tool errors", async () => {
    const store = new ReviewStore(":memory:", {
      validatePins: async () => {},
      validateSource: async () => {},
      validateResource: async () => {},
    });

    const app = createReviewApi(
      store,
      undefined,
      async () => ({ softwareMapEnabled: false }),
      () => ({ desktopAvailable: true, softwareMapEnabled: false }),
      () => true,
    );

    let failInstruction = false;

    const client = new ReviewApiClient(
      {
        serverUrl: "http://review.test",
        token: "test",
      },
      async (url, init) => {
        if (failInstruction && url.includes("/instructions"))
          return new Response(JSON.stringify({ error: "server failed" }), {
            status: 500,
          });

        return app.request(url.replace("/reviews-api", ""), init);
      },
    );

    const mcp = await startMcp(async () => client);

    try {
      await mcp.request(1, "initialize", initialize);

      const list = await mcp.request(2, "tools/list", {});
      expect(list.result.tools[0].description).toContain('topic:"scratchpad"');

      const invalid = await mcp.request(3, "tools/call", {
        name: "session_get_instructions",
        arguments: { topic: "../secrets" },
      });

      expect(invalid.result.isError).toBe(true);
      expect(invalid.result.content[0].text).not.toMatch(
        /^Blackboard is not running/,
      );

      failInstruction = true;

      const failed = await mcp.request(4, "tools/call", {
        name: "session_get_instructions",
        arguments: {},
      });

      expect(failed.result.isError).toBe(true);
      expect(failed.result.content[0].text).toBe("server failed");
    } finally {
      await mcp.close();
      store.close();
    }
  });
});
