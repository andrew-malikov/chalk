import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Writable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";

import { LOG_LEVELS, logsDir } from "@review/node/log";
import { z } from "zod";

interface ReviewLogsInput {
  env: NodeJS.ProcessEnv;
  stdout: Writable;
  json?: boolean;
  level?: string;
  since?: string;
  lines?: string;
  follow?: boolean;
}

const logRecordSchema = z.looseObject({
  t: z.string(),
  lvl: z.enum(LOG_LEVELS),
  proc: z.string(),
  pid: z.number(),
  scope: z.string(),
  msg: z.string(),
  error: z
    .looseObject({
      message: z.string().optional(),
      stack: z.string().optional(),
    })
    .optional(),
});

type LogRecord = z.infer<typeof logRecordSchema>;

const DURATION_MS = new Map([
  ["s", 1e3],
  ["m", 6e4],
  ["h", 36e5],
  ["d", 864e5],
]);

/** Merges every process's log by time; `follow` polls for new records. */
export async function showReviewLogs(input: ReviewLogsInput): Promise<void> {
  const minLevel = LOG_LEVELS.findIndex(
    (level) => level === (input.level ?? "debug"),
  );

  if (minLevel < 0)
    throw new Error(`--level must be one of ${LOG_LEVELS.join(", ")}.`);

  const duration = input.since?.match(/^(\d+)([smhd])$/);

  if (input.since && !duration)
    throw new Error("--since takes a duration like 30s, 10m, 2h or 1d.");

  const since = duration
    ? new Date(
        Date.now() -
          Number(duration[1]) * (DURATION_MS.get(duration[2] ?? "") ?? 0),
      ).toISOString()
    : "";

  const lines = Number(input.lines ?? 200);
  const dir = logsDir(input.env);
  const offsets = new Map<string, number>();

  // Rotated `.1` files are read once; following needs only the live files.
  const read = async (rotated: boolean) => {
    const names = await readdir(dir).catch((): string[] => []);
    const records: LogRecord[] = [];

    for (const name of names) {
      if (!name.endsWith(".jsonl") && !(rotated && name.endsWith(".jsonl.1")))
        continue;

      const file = path.join(dir, name);
      const bytes = await readFile(file).catch(() => Buffer.alloc(0));

      // A smaller file was rotated since the last read.
      const from =
        bytes.length < (offsets.get(file) ?? 0) ? 0 : (offsets.get(file) ?? 0);

      // Stop at the last newline so a record being appended is read whole later.
      const end = bytes.lastIndexOf(10) + 1;

      if (end <= from) continue;
      offsets.set(file, end);

      for (const line of bytes
        .subarray(from, end)
        .toString("utf8")
        .split("\n")) {
        let json = null;

        try {
          json = JSON.parse(line);
        } catch {
          // Blank or torn line.
        }

        const parsed = logRecordSchema.safeParse(json);

        if (
          parsed.success &&
          LOG_LEVELS.indexOf(parsed.data.lvl) >= minLevel &&
          parsed.data.t >= since
        )
          records.push(parsed.data);
      }
    }

    return records.sort((a, b) => a.t.localeCompare(b.t));
  };

  const print = (records: LogRecord[]) => {
    for (const record of records)
      input.stdout.write(
        input.json ? `${JSON.stringify(record)}\n` : formatRecord(record),
      );
  };

  print((await read(true)).slice(-lines));

  while (input.follow) {
    await sleep(500);
    print(await read(false));
  }
}

function formatRecord(record: LogRecord): string {
  const { t, lvl, proc, pid, scope, msg, error, ...fields } = record;

  const extra = Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : "";

  const cause = error
    ? `\n    ${(error.stack ?? error.message ?? "").replaceAll("\n", "\n    ")}`
    : "";

  return `${t.replace("T", " ").slice(0, 23)} ${lvl.toUpperCase().padEnd(5)} ${proc}[${pid}] ${scope}: ${msg}${extra}${cause}\n`;
}
