import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { expect, it } from "vitest";

import { showReviewLogs } from "./review-logs";

it("merges every process's logs by time and filters by level", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "chalk-logs-"));
  await mkdir(path.join(home, "logs"));

  const record = (t: string, lvl: string, proc: string, msg: string) =>
    `${JSON.stringify({ t: `2026-01-01T00:00:0${t}.000Z`, lvl, proc, pid: 1, scope: "s", msg })}\n`;

  await writeFile(
    path.join(home, "logs", "server.jsonl"),
    record("3", "error", "server", "third") +
      record("4", "debug", "server", "hidden"),
  );
  await writeFile(
    path.join(home, "logs", "server.jsonl.1"),
    record("1", "warn", "server", "first"),
  );
  // The last record is still being appended.
  await writeFile(
    path.join(home, "logs", "desktop.jsonl"),
    record("2", "info", "desktop", "second") + '{"t":"2026',
  );

  let output = "";

  await showReviewLogs({
    env: { CHALK_HOME: home },
    level: "info",
    json: true,
    stdout: new Writable({
      write(chunk, _encoding, done) {
        output += chunk;
        done();
      },
    }),
  });

  expect(
    output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).msg),
  ).toEqual(["first", "second", "third"]);
});
