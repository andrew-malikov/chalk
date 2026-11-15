import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { chalkHome } from "./storage/chalk-paths";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Write-only: fields are serialized to the log, never read back.
type LogFields = Record<string, unknown>;

// One previous file is kept, so each process holds at most twice this.
const MAX_LOG_BYTES = 5 * 1024 * 1024;

let sink:
  | { file: string; proc: string; home: string; echo: boolean; size: number }
  | undefined;

let debugCheckedAt = 0;

let debugEnabled = false;

export function logsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(chalkHome(env), "logs");
}

/**
 * Starts writing `<chalk home>/logs/<proc>.jsonl`. Records before this, and
 * in tests that never call it, are dropped. `echo` mirrors warnings and
 * errors to stderr for processes whose stderr someone reads.
 */
export function openLog(
  proc: "desktop" | "server" | "cli" | "mcp",
  { env = process.env, echo = false } = {},
): void {
  const dir = logsDir(env);

  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return;
  }

  const file = path.join(dir, `${proc}.jsonl`);
  let size = 0;

  try {
    size = statSync(file).size;
  } catch {
    // First record creates it.
  }

  sink = { file, proc, home: chalkHome(env), echo, size };
  process.on("uncaughtExceptionMonitor", (error, origin) =>
    log.error("process", origin, { error }),
  );
  // Without this, Bun reports rejections without the monitor; rethrowing keeps
  // the default crash.
  process.on("unhandledRejection", (reason) => {
    throw reason;
  });
}

// CHALK_DEBUG=1 or the Desktop "Debug logging" setting, which every process
// re-reads at most once a second so the toggle applies without restarts.
function debugOn(): boolean {
  if (process.env.CHALK_DEBUG === "1") return true;

  if (sink && Date.now() - debugCheckedAt > 1000) {
    debugCheckedAt = Date.now();

    try {
      debugEnabled =
        JSON.parse(
          readFileSync(path.join(sink.home, "preferences.json"), "utf8"),
        ).debugLogging === true;
    } catch {
      debugEnabled = false;
    }
  }

  return debugEnabled;
}

function write(
  lvl: LogLevel,
  scope: string,
  msg: string,
  fields?: LogFields,
): void {
  if (!sink || (lvl === "debug" && !debugOn())) return;

  const line =
    JSON.stringify(
      {
        t: new Date().toISOString(),
        lvl,
        proc: sink.proc,
        pid: process.pid,
        scope,
        msg,
        ...fields,
      },
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JSON.stringify replacer sees every value; it only swaps Errors.
      (_key, value: unknown) =>
        value instanceof Error
          ? { name: value.name, message: value.message, stack: value.stack }
          : value,
    ) + "\n";

  if (sink.echo && (lvl === "warn" || lvl === "error"))
    process.stderr.write(line);

  try {
    if (sink.size > MAX_LOG_BYTES) {
      renameSync(sink.file, `${sink.file}.1`);
      sink.size = 0;
    }

    appendFileSync(sink.file, line);
    sink.size += Buffer.byteLength(line);
  } catch {
    // Logging must never be the reason a command fails.
  }
}

/** Never log file contents, diff text, comment bodies or tokens. */
export const log = {
  debug: (scope: string, msg: string, fields?: LogFields) =>
    write("debug", scope, msg, fields),
  info: (scope: string, msg: string, fields?: LogFields) =>
    write("info", scope, msg, fields),
  warn: (scope: string, msg: string, fields?: LogFields) =>
    write("warn", scope, msg, fields),
  error: (scope: string, msg: string, fields?: LogFields) =>
    write("error", scope, msg, fields),
};
