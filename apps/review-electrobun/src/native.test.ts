import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test, vi } from "vitest";

import {
  createQuitGate,
  externalURL,
  newWindowURL,
  openSource,
  openVSCode,
  sourceArguments,
} from "./native";

test("VS Code receives paths as separate arguments, with original line numbers", () => {
  const file = '/tmp/a "quote"; $(touch nope).ts';
  expect(
    sourceArguments({
      kind: "file",
      rootPath: "/tmp/project space",
      filePath: file,
      range: { startLine: 42, endLine: 44 },
    }),
  ).toEqual(["--goto", `${file}:42:1`]);
  expect(
    sourceArguments({
      kind: "diff",
      rootPath: "/tmp/w",
      originalPath: "/tmp/old.ts",
      modifiedPath: "/tmp/new.ts",
    }),
  ).toEqual(["--diff", "/tmp/old.ts", "/tmp/new.ts"]);
  expect(() =>
    sourceArguments({
      kind: "file",
      rootPath: "/tmp/w",
      filePath: "--flag",
    }),
  ).toThrow(Error);
});

test("real CLI execution preserves literal Unicode and shell characters", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "review-code-"));
  const oldPath = process.env.PATH;
  const log = path.join(root, "args.jsonl");
  const code = path.join(root, "code");
  await writeFile(
    code,
    `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');`,
  );
  await chmod(code, 0o700);
  process.env.PATH = `${root}:${oldPath}`;

  try {
    await openVSCode({
      kind: "file",
      rootPath: "/tmp/work space",
      filePath: '/tmp/π "quoted"; $(touch nope).ts',
      range: { startLine: 42, endLine: 43 },
    });
    expect(
      (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      ["--new-window", "/tmp/work space"],
      ["--goto", '/tmp/π "quoted"; $(touch nope).ts:42:1'],
    ]);
  } finally {
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("Zed and Finder open the source tree through LaunchServices", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "review-open-"));
  const oldPath = process.env.PATH;
  const log = path.join(root, "args.jsonl");

  for (const command of ["open", "code"]) {
    const file = path.join(root, command);
    await writeFile(
      file,
      `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)},JSON.stringify([${JSON.stringify(command)},...process.argv.slice(2)])+'\\n');`,
    );
    await chmod(file, 0o700);
  }
  process.env.PATH = `${root}:${oldPath}`;

  try {
    await openSource({ kind: "directory", rootPath: "/tmp/w s", app: "zed" });
    await openSource({
      kind: "directory",
      rootPath: "/tmp/w s",
      app: "finder",
    });
    await openSource({ kind: "directory", rootPath: "/tmp/w s" });
    expect(
      (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      ["open", "-a", "Zed", "/tmp/w s"],
      ["open", "-a", "Finder", "/tmp/w s"],
      ["code", "--new-window", "/tmp/w s"],
    ]);
  } finally {
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("missing and failing VS Code launchers report failure", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "review-code-fail-"));
  const oldPath = process.env.PATH;
  process.env.PATH = root;

  try {
    const request = { kind: "directory" as const, rootPath: "/tmp/w" };
    await expect(openVSCode(request)).rejects.toThrow(/VS Code/);
    const code = path.join(root, "code");
    await writeFile(code, `#!${process.execPath}\nprocess.exit(7);`);
    await chmod(code, 0o700);
    await expect(openVSCode(request)).rejects.toThrow(/VS Code/);
  } finally {
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("external navigation permits web/mail URLs and rejects executable schemes", () => {
  expect(externalURL({ url: "https://example.com" })).toBe(
    "https://example.com",
  );
  expect(externalURL({ url: "mailto:person@example.com" })).toBe(
    "mailto:person@example.com",
  );
  expect(() => externalURL({ url: "javascript:alert(1)" })).toThrow(Error);
  expect(() => externalURL({ url: "file:///etc/passwd" })).toThrow(Error);
});

test("synchronous quit cancellation awaits one cleanup and permits the retry", async () => {
  let resolve!: () => void;
  const pending = new Promise<void>((r) => (resolve = r));
  const cleanup = vi.fn<() => Promise<void>>(() => pending);
  const retry = vi.fn<() => void>();
  const gate = createQuitGate(cleanup, retry);
  const first: Parameters<ReturnType<typeof createQuitGate>>[0] = {};
  gate(first);
  gate({});
  expect(first.response).toEqual({ allow: false });
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(retry).not.toHaveBeenCalled();
  resolve();
  await pending;
  await Promise.resolve();
  expect(retry).toHaveBeenCalledTimes(1);
  const last: Parameters<ReturnType<typeof createQuitGate>>[0] = {};
  gate(last);
  expect(last.response).toBeUndefined();
});

test("native new-window payloads retain allowed URLs and reject privileged navigation", () => {
  expect(
    newWindowURL({ url: "https://example.com/review", isCmdClick: true }),
  ).toBe("https://example.com/review");
  expect(
    newWindowURL(
      JSON.stringify({ url: "mailto:review@example.com", isCmdClick: true }),
    ),
  ).toBe("mailto:review@example.com");
  expect(() =>
    newWindowURL({ url: "javascript:alert(1)", isCmdClick: true }),
  ).toThrow("Unsupported external URL scheme");
  expect(() =>
    newWindowURL({ url: "views://mainview/index.html", isCmdClick: true }),
  ).toThrow("Unsupported external URL scheme");
});
