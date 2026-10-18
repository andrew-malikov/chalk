import type { ReviewDiffFileWire } from "@chalk/review-contracts";
import {
  type FileDiffLoadedFiles,
  type FileDiffMetadata,
  parsePatchFiles,
} from "@pierre/diffs";

import { loadStructuralFile } from "./structural-comparison";

export interface PierreComparisonEntry {
  file: ReviewDiffFileWire;
  diff?: FileDiffMetadata;
  notice?: string;
  error?: string;
  bytes?: number;
}

type Request = (url: string | URL, init?: RequestInit) => Promise<Response>;

export async function loadPierreComparison({
  files,
  url,
  signal,
  request,
  preferredFile,
  onUpdate,
  structural = false,
}: {
  files: readonly ReviewDiffFileWire[];
  url: string;
  signal: AbortSignal;
  request: Request;
  preferredFile?(): string | undefined;
  onUpdate(entries: PierreComparisonEntry[]): void;
  structural?: boolean;
}): Promise<PierreComparisonEntry[]> {
  const entries = files.map((file): PierreComparisonEntry => ({ file }));
  const queue = entries.map((entry, index) => ({ entry, index }));
  const publish = () => {
    signal.throwIfAborted();
    onUpdate([...entries]);
  };
  async function worker() {
    while (queue.length > 0) {
      signal.throwIfAborted();
      const preferred = queue.findIndex(
        ({ entry }) => entry.file.path === preferredFile?.(),
      );
      const { entry: queued, index } = queue.splice(
        Math.max(0, preferred),
        1,
      )[0]!;
      const entry = { ...queued };
      if (entry.file.binary) {
        entry.notice = "Binary file";
        entries[index] = entry;
        publish();
        continue;
      }
      const patchUrl = new URL(url);
      patchUrl.searchParams.set("format", "raw");
      patchUrl.searchParams.set("file", entry.file.path);
      patchUrl.searchParams.set("maxBytes", "500000");
      try {
        if (
          structural &&
          (await loadStructuralFile(entry, new URL(patchUrl), request, signal))
        ) {
          entries[index] = entry;
          publish();
          continue;
        }

        const response = await request(patchUrl, { signal });
        await assertResponse(response);
        const patch = await response.text();
        signal.throwIfAborted();
        const patchBytes = new TextEncoder().encode(patch);
        entry.bytes = patchBytes.byteLength;
        if (patch.length === 0) entry.notice = "No changes in this file";
        else {
          const digest = await crypto.subtle.digest("SHA-256", patchBytes);
          signal.throwIfAborted();
          const hash = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
          const parsed = parsePatchFiles(
            patch,
            `${patchUrl.href}:${hash}`,
            true,
          ).flatMap((patch) => patch.files);
          if (parsed.length !== 1)
            throw new Error("Expected one complete file patch");
          entry.diff = parsed[0]!;
          entry.diff.name = entry.file.path;
          if (entry.file.previousPath)
            entry.diff.prevName = entry.file.previousPath;
        }
      } catch (cause) {
        signal.throwIfAborted();
        entry.diff = undefined;
        entry.error = cause instanceof Error ? cause.message : String(cause);
      }
      entries[index] = entry;
      publish();
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker));
  return entries;
}

/** Only use for immutable comparisons: a worktree generation does not freeze bytes. */
export async function loadPierreFile(
  diff: FileDiffMetadata,
  url: string,
  request: Request,
  signal: AbortSignal,
): Promise<FileDiffLoadedFiles> {
  async function read(side: "base" | "head", name: string) {
    const fileUrl = new URL(url);
    fileUrl.pathname = fileUrl.pathname.replace(/\/diff$/, "/file");
    fileUrl.searchParams.set("file", name);
    fileUrl.searchParams.set("side", side);
    const response = await request(fileUrl, { signal });
    await assertResponse(response);
    const file: { text: string } = await response.json();
    return { name, contents: file.text, cacheKey: fileUrl.href };
  }
  const [oldFile, newFile] = await Promise.all([
    diff.type === "rename-pure"
      ? null
      : read("base", diff.prevName ?? diff.name),
    read("head", diff.name),
  ]);
  return { oldFile, newFile };
}

async function assertResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const error: { error?: string } = await response.json();
  throw new Error(error.error ?? `Request failed (${response.status})`);
}
