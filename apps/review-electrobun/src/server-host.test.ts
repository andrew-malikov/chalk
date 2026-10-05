import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { REVIEW_DESKTOP_DISCOVERY_VERSION } from "@dev.fast/review-protocol";
import { afterEach, expect, test } from "vitest";

import { type ServerOptions, startServer } from "./server-host";

const roots: string[] = [];

const hosts: Awaited<ReturnType<typeof startServer>>[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((h) => h.stop()));
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});

async function fixture(mode = "ready"): Promise<ServerOptions> {
  const root = await mkdtemp(path.join(tmpdir(), "review-host-"));
  roots.push(root);
  const entry = path.join(root, "child.cjs");
  await writeFile(
    entry,
    `
 const env=process.env;
 const ready={event:'ready',version:${REVIEW_DESKTOP_DISCOVERY_VERSION},instanceId:env.DEV_FAST_REVIEW_INSTANCE_ID,url:'http://127.0.0.1:5570',appPid:Number(env.DEV_FAST_REVIEW_APP_PID),serverPid:process.pid,token:env.DEV_FAST_REVIEW_SERVER_TOKEN,startedAt:Date.now(),key:env.DEV_FAST_REVIEW_INSTANCE_KEY,channel:'dev'};
 const mode=env.REVIEW_TEST_MODE;
 if(mode==='bad') ready.token='wrong';
 if(mode==='exit') process.exit(7);
 if(mode==='ignore-stop') process.on('SIGTERM',()=>{});
 if(mode!=='silent') {
  process.stdout.write(JSON.stringify({event:'migration',message:'Preparing profile'})+'\\n');
  const text=JSON.stringify(ready)+'\\n';process.stdout.write(text.slice(0,17));setTimeout(()=>process.stdout.write(text.slice(17)),5);
 }
 setInterval(()=>{},1000);
 `,
  );

  return {
    runtimePath: process.execPath,
    entry,
    checkout: root,
    profile: root,
    key: "dev-electrobun-test",
    env: { ...process.env, REVIEW_TEST_MODE: mode },
    startupTimeoutMs: 500,
    shutdownTimeoutMs: 30,
  };
}

test("assembles split ready frames and reports migrations, then reaps the child", async () => {
  const events: string[] = [];
  const options = await fixture();
  options.onState = (s) => events.push(s.message);
  const host = await startServer(options);
  hosts.push(host);
  expect(host.discovery.key).toBe(options.key);
  expect(host.discovery.appPid).toBe(process.pid);
  expect(events).toContain("Preparing profile");
  await host.stop();
  expect(() => process.kill(host.discovery.serverPid, 0)).toThrow(Error);
});

test.each(["bad", "silent", "exit"])(
  "rejects %s startup and cleans up",
  async (mode) => {
    await expect(startServer(await fixture(mode))).rejects.toThrow(Error);
  },
);

test("bounded shutdown reaps a child which ignores SIGTERM", async () => {
  const host = await startServer(await fixture("ignore-stop"));
  hosts.push(host);
  await Promise.all([host.stop(), host.stop()]);
  expect(() => process.kill(host.discovery.serverPid, 0)).toThrow(Error);
});

test("rejects an occupied profile even before a renderer attaches", async () => {
  const options = await fixture();

  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        instanceId: "occupied",
        serverPid: process.pid,
        desktopAttached: false,
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  const record = {
    version: REVIEW_DESKTOP_DISCOVERY_VERSION,
    instanceId: "occupied",
    url: `http://127.0.0.1:${port}`,
    appPid: process.pid,
    serverPid: process.pid,
    token: "token",
    startedAt: Date.now(),
    key: options.key,
  };

  const file = path.join(
    options.profile,
    "review-desktop/instances",
    `${options.key}.json`,
  );

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(record));

  try {
    await expect(startServer(options)).rejects.toThrow(/already running/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("shutdown preserves discovery owned by a different instance", async () => {
  const options = await fixture();
  const host = await startServer(options);
  hosts.push(host);

  const file = path.join(
    options.profile,
    "review-desktop/instances",
    `${options.key}.json`,
  );

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ ...host.discovery, instanceId: "another" }),
  );
  await host.stop();
  expect(JSON.parse(await readFile(file, "utf8")).instanceId).toBe("another");
});

test("cancels startup before readiness and releases the child", async () => {
  const options = await fixture("silent");
  const abort = new AbortController();
  const pending = startServer({ ...options, signal: abort.signal });
  abort.abort();
  await expect(pending).rejects.toThrow(/cancelled/);
});
