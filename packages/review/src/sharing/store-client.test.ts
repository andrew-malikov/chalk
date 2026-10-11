import { describe, expect, it } from "vitest";

import { StoreClient } from "./store-client";

const origin = "https://app.dev.fast";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("sharing account client", () => {
  it("requests identity without repository authorization", async () => {
    let request: RequestInit | undefined;
    const client = new StoreClient({
      origin,
      fetch: async (_url, init) => {
        request = init;
        return json({
          device_code: "dc",
          user_code: "code",
          verification_uri_complete: origin,
          expires_in: 900,
          interval: 1,
        });
      },
    });
    await client.deviceCode();
    expect(JSON.parse(String(request?.body))).toEqual({
      client_id: "review-cli",
      scope: "identity",
    });
  });
  it("keeps bearer authentication and account error envelopes", async () => {
    let headers: HeadersInit | undefined;
    const client = new StoreClient({
      origin,
      token: "saved-token",
      fetch: async (_url, init) => {
        headers = init?.headers;
        return json({ error: { code: "forbidden", message: "no" } }, 403);
      },
    });
    await expect(client.session()).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
      message: "no",
    });
    expect(new Headers(headers).get("authorization")).toBe(
      "Bearer saved-token",
    );
  });
  it.each(["authorization_pending", "slow_down"])(
    "keeps device polling state %s",
    async (error) => {
      const client = new StoreClient({
        origin,
        fetch: async () => json({ error }, 400),
      });
      expect(await client.deviceToken("dc")).toEqual({ pending: error });
    },
  );
  it("rejects malformed account responses", async () => {
    const client = new StoreClient({
      origin,
      fetch: async () => json({ nonsense: true }),
    });
    await expect(client.session()).rejects.toMatchObject({
      code: "upgrade_required",
    });
  });
  it("rejects oversized metadata", async () => {
    const client = new StoreClient({
      origin,
      fetch: async () =>
        new Response("{}", {
          headers: { "content-length": String(8 * 1024 * 1024 + 1) },
        }),
    });
    await expect(client.session()).rejects.toMatchObject({ code: "internal" });
  });
});
