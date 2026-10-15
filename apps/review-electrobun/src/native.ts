import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import type { AppRPC, NativeOpenRequest } from "./rpc";

const absolutePath = z
  .string()
  .refine(path.isAbsolute, "Expected an absolute path.");

const range = z.strictObject({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  side: z.enum(["base", "head"]).optional(),
});

const openSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("directory"),
    rootPath: absolutePath,
    app: z.enum(["zed", "finder"]).optional(),
  }),
  z.strictObject({
    kind: z.literal("file"),
    rootPath: absolutePath,
    filePath: absolutePath,
    range: range.optional(),
  }),
  z.strictObject({
    kind: z.literal("diff"),
    rootPath: absolutePath,
    originalPath: absolutePath,
    modifiedPath: absolutePath,
  }),
]);

export function sourceArguments(input: NativeOpenRequest): string[] {
  const request = openSchema.parse(input);

  if (request.kind === "directory") return ["--new-window", request.rootPath];

  if (request.kind === "diff")
    return ["--diff", request.originalPath, request.modifiedPath];

  return [
    "--goto",
    request.range
      ? `${request.filePath}:${request.range.startLine}:1`
      : request.filePath,
  ];
}

export function createQuitGate(
  cleanup: () => Promise<void>,
  retry: () => void,
) {
  let done = false;
  let pending: Promise<void> | undefined;

  return (event: { response?: unknown }) => {
    if (done) return;
    event.response = { allow: false };
    pending ??= cleanup().then(() => {
      done = true;
      retry();
    });
  };
}

export function externalURL(
  input: AppRPC["bun"]["requests"]["openExternal"]["params"],
): string {
  const { url } = z.strictObject({ url: z.string().url() }).parse(input);

  if (!["http:", "https:", "mailto:"].includes(new URL(url).protocol))
    throw new Error("Unsupported external URL scheme.");

  return url;
}

const execute = promisify(execFile);

export async function openSource(
  input: NativeOpenRequest,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const request = openSchema.parse(input);

  if (request.kind !== "directory" || !request.app)
    return openVSCode(request, baseEnv);
  // LaunchServices finds the app, so neither needs a CLI on PATH.
  const name = request.app === "zed" ? "Zed" : "Finder";

  try {
    await execute("open", ["-a", name, request.rootPath]);
  } catch (error) {
    throw new Error(`Cannot open ${name}. ${String(error)}`);
  }
}

export async function openVSCode(
  request: NativeOpenRequest,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const args = sourceArguments(request);
  const env = { ...baseEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VSCODE_IPC_HOOK_CLI;
  delete env.VSCODE_PORTABLE;
  delete env.NODE_OPTIONS;

  const run = async (args: string[]) => {
    try {
      await execute("code", args, { env });
    } catch (error) {
      throw new Error(
        `Cannot open VS Code. Ensure its code command is on PATH. ${String(error)}`,
      );
    }
  };

  if (request.kind !== "directory")
    await run(["--new-window", request.rootPath]);
  await run(args);
}

export type NewWindowDetail = string | { url: string; isCmdClick?: boolean };

export function newWindowURL(input: NewWindowDetail): string {
  const { url } = z
    .union([
      z.string().transform((detail) => {
        try {
          return JSON.parse(detail);
        } catch {
          return { url: detail };
        }
      }),
      z.object({ url: z.string() }),
    ])
    .pipe(z.object({ url: z.string() }))
    .parse(input);

  return externalURL({ url });
}
