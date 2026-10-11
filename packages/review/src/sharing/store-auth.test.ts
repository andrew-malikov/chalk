import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import type { JsonValue } from "@dev.fast/json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStoreAuth,
  readStoreAuth,
  runStoreLogin,
  writeStoreAuth,
} from "./store-auth";

function json(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function outputStream(): PassThrough {
  return new PassThrough();
}

describe("store-auth", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "review-store-auth-"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    await rm(tmp, { recursive: true, force: true });
  });

  it("writes auth.json under DEV_REVIEW_HOME with mode 0600", async () => {
    vi.stubEnv("DEV_REVIEW_HOME", tmp);
    await writeStoreAuth({
      origin: "https://app.dev.fast",
      token: "t",
      login: "dev",
      savedAt: "2026-09-02T00:00:00Z",
    });
    const fileStat = await stat(path.join(tmp, "auth.json"));
    expect(fileStat.mode & 0o777).toBe(0o600);
    expect(await readStoreAuth()).toMatchObject({ token: "t" });
  });

  it("treats a login for an invalid origin as no login", async () => {
    vi.stubEnv("DEV_REVIEW_HOME", tmp);
    await writeStoreAuth({
      origin: "https://App.dev.fast/",
      token: "t",
      login: "dev",
      savedAt: "2026-09-02T00:00:00Z",
    });
    expect((await readStoreAuth())?.origin).toBe("https://app.dev.fast");
    await expect(
      writeStoreAuth({
        origin: "https://app.dev.fast/api",
        token: "t",
        login: "dev",
        savedAt: "2026-09-02T00:00:00Z",
      }),
    ).rejects.toThrow("origin");

    const stdout = outputStream();
    const stderr = outputStream();
    let errors = "";
    stderr.on("data", (chunk) => {
      errors += chunk.toString();
    });

    const code = await runStoreLogin({
      origin: "http://store.example.com",
      stdout,
      stderr,
      fetch:
        vi.fn<
          (
            input: Request | string | URL,
            init?: RequestInit,
          ) => Promise<Response>
        >(),
      sleep: async () => {},
    });

    expect(code).toBe(1);
    expect(errors).toContain("https");
  });

  it.each([false, true])(
    "completes device login even with an expired saved token: %s",
    async (expired) => {
      vi.stubEnv("DEV_REVIEW_HOME", tmp);
      const stdout = outputStream();
      const stderr = outputStream();

      if (expired)
        await writeStoreAuth({
          origin: "https://app.dev.fast",
          token: "expired",
          login: "old",
          savedAt: "2026-09-02T00:00:00Z",
        });

      const responses = [
        json({
          device_code: "dc",
          user_code: "ABCD-1234",
          verification_uri_complete:
            "https://app.dev.fast/device?user_code=ABCD-1234",
          expires_in: 900,
          interval: 1,
        }),
        json({ error: "authorization_pending" }, 400),
        json({ access_token: "tok", token_type: "Bearer" }),
        json({ user: { id: "user-1", name: "dev" } }),
      ];

      const fetch = vi.fn<
        (input: Request | string | URL, init?: RequestInit) => Promise<Response>
      >(async () => responses.shift()!);

      const opened: string[] = [];

      const code = await runStoreLogin({
        stdout,
        stderr,
        fetch,
        openUrl: async (u) => {
          opened.push(u);
        },
        sleep: async () => {},
      });

      expect(code).toBe(0);
      expect(opened[0]).toContain("user_code=ABCD-1234");
      expect((await readStoreAuth())?.token).toBe("tok");
    },
  );
  it("backs off slow polling by five seconds", async () => {
    const env = { DEV_REVIEW_HOME: tmp };
    const sleeps: number[] = [];
    const responses = [
      json({
        device_code: "dc",
        user_code: "code",
        verification_uri_complete: "https://app.dev.fast/device",
        expires_in: 900,
        interval: 1,
      }),
      json({ error: "authorization_pending" }, 400),
      json({ error: "slow_down" }, 400),
      json({ access_token: "new-token" }),
      json({ user: { id: "user-1", name: "dev" } }),
    ];
    const code = await runStoreLogin({
      env,
      stdout: outputStream(),
      stderr: outputStream(),
      noBrowser: true,
      fetch: async () => responses.shift()!,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(code).toBe(0);
    expect(sleeps).toEqual([1000, 1000, 6000]);
    expect((await readStoreAuth(env))?.token).toBe("new-token");
  });
  it("keeps saved credentials when a device authorization expires", async () => {
    const env = { DEV_REVIEW_HOME: tmp };
    const saved = {
      origin: "https://app.dev.fast",
      token: "saved",
      login: "dev",
      savedAt: "2026-09-02T00:00:00Z",
    };
    await writeStoreAuth(saved, env);
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const responses = [
      json({
        device_code: "dc",
        user_code: "code",
        verification_uri_complete: "https://app.dev.fast/device",
        expires_in: 1,
        interval: 1,
      }),
      json({ error: "authorization_pending" }, 400),
    ];
    const code = await runStoreLogin({
      env,
      stdout: outputStream(),
      stderr: outputStream(),
      noBrowser: true,
      fetch: async () => responses.shift()!,
      sleep: async (ms) => {
        vi.setSystemTime(Date.now() + ms);
      },
    });
    expect(code).toBe(1);
    expect(responses).toHaveLength(0);
    expect(await readStoreAuth(env)).toEqual(saved);
  });
  it("logout removes credentials while preserving other profile files", async () => {
    const env = { DEV_REVIEW_HOME: tmp };
    await writeStoreAuth(
      {
        origin: "https://app.dev.fast",
        token: "saved",
        login: "dev",
        savedAt: "now",
      },
      env,
    );
    await writeFile(path.join(tmp, "review-api.db"), "existing reviews");
    await clearStoreAuth(env);
    expect(await readStoreAuth(env)).toBeNull();
    expect(await readFile(path.join(tmp, "review-api.db"), "utf8")).toBe(
      "existing reviews",
    );
  });
});
