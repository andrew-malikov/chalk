import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { REVIEW_DESKTOP_DISCOVERY_VERSION } from "@blackboard/review-protocol";
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
 if(mode==='tools') {
  const {execFileSync}=require('node:child_process');
  const versions=['glab','git','inherited-tool'].map(tool=>execFileSync(tool,['--version'],{encoding:'utf8'}).trim());
  require('node:fs').writeFileSync(env.REVIEW_TEST_VERSIONS,JSON.stringify(versions));
 }
 if(mode==='bad') ready.token='wrong';
 if(mode==='exit') process.exit(7);
 if(mode==='ignore-stop') process.on('SIGTERM',()=>{});
 if(mode!=='silent') {
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
    env: { ...process.env, SHELL: "/bin/sh", REVIEW_TEST_MODE: mode },
    startupTimeoutMs: 500,
    shutdownTimeoutMs: 30,
  };
}

test.skipIf(process.platform !== "darwin")(
  "Finder-launched server finds shell-installed GitLab tools and inherited commands",
  async () => {
    const options = await fixture("tools");
    const bin = path.join(options.profile, "shell tools");
    const inheritedBin = path.join(options.profile, "inherited tools");
    await mkdir(bin);
    await mkdir(inheritedBin);

    for (const [directory, tool, version] of [
      [bin, "glab", "glab fixture 1.0"],
      [bin, "git", "git fixture 2.0"],
      [inheritedBin, "inherited-tool", "inherited fixture 3.0"],
    ]) {
      const file = path.join(directory!, tool!);
      await writeFile(file, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
      await chmod(file, 0o755);
    }

    await writeFile(
      path.join(options.profile, ".zshrc"),
      'printf "shell startup output\\n"\nexport PATH="$REVIEW_TEST_BIN:/usr/bin:/bin"\n',
    );
    const versionsFile = path.join(options.profile, "versions.json");
    options.env = {
      ...options.env,
      PATH: `${inheritedBin}:/usr/bin:/bin:/usr/sbin:/sbin`,
      SHELL: "/bin/zsh",
      ZDOTDIR: options.profile,
      REVIEW_TEST_BIN: bin,
      REVIEW_TEST_VERSIONS: versionsFile,
    };
    options.startupTimeoutMs = 3000;

    const host = await startServer(options);
    hosts.push(host);
    expect(JSON.parse(await readFile(versionsFile, "utf8"))).toEqual([
      "glab fixture 1.0",
      "git fixture 2.0",
      "inherited fixture 3.0",
    ]);
  },
);

test("server still starts when the configured shell is unavailable", async () => {
  const options = await fixture();
  options.env!.SHELL = path.join(options.profile, "missing-shell");
  const host = await startServer(options);
  hosts.push(host);
  expect(host.discovery.key).toBe(options.key);
});

test("assembles split ready frames, then reaps the child", async () => {
  const options = await fixture();
  const host = await startServer(options);
  hosts.push(host);
  expect(host.discovery.key).toBe(options.key);
  expect(host.discovery.appPid).toBe(process.pid);
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
