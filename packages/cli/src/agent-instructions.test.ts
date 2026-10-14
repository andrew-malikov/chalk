import { Writable } from "node:stream";

import * as agentClient from "@blackboard/mcp/agent-client.js";
import { ReviewApiClient } from "@blackboard/review-contracts";
import { createReviewApi } from "@blackboard/server/review-api/http.js";
import { ReviewStore } from "@review/node/review-api/store.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runReviewAgentCli } from "./agent-cli.js";

describe("CLI instructions", () => {
  const stores: ReviewStore[] = [];

  afterEach(() => {
    for (const store of stores) store.close();
    stores.length = 0;
  });

  const api = () => {
    const store = new ReviewStore(":memory:", {
      validatePins: async () => {},
      validateSource: async () => {},
      validateResource: async () => {},
    });

    stores.push(store);
    const app = createReviewApi(store);

    return new ReviewApiClient(
      { serverUrl: "http://review.test", token: "test" },
      async (url, init) => app.request(url.replace("/reviews-api", ""), init),
    );
  };

  it("prints CLI guidance as raw text and reports offline recovery on stderr", async () => {
    const client = api();
    const connection = vi.spyOn(agentClient, "connectReviewApi");
    let stdout = "";
    let stderr = "";

    const output = new Writable({
      write(chunk, _encoding, done) {
        stdout += chunk;
        done();
      },
    });

    const errors = new Writable({
      write(chunk, _encoding, done) {
        stderr += chunk;
        done();
      },
    });

    try {
      connection.mockResolvedValueOnce(client);
      expect(
        await runReviewAgentCli({
          argv: ["api", "session_get_instructions", "{}"],
          stdout: output,
          stderr: errors,
        }),
      ).toBe(0);
      expect(stdout).toContain("rfc-style blackboard");
      expect(stdout).not.toMatch(/^"/);

      connection.mockRejectedValueOnce(new Error("Desktop is down"));
      expect(
        await runReviewAgentCli({
          argv: ["api", "session_get_instructions", "{}"],
          stdout: output,
          stderr: errors,
        }),
      ).toBe(1);
      expect(stderr).toMatch(/^Blackboard is not running/);
    } finally {
      connection.mockRestore();
    }
  });
});
