import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ReviewDesktopDiscovery } from "@chalk/review-contracts";
import {
  type ReviewInstanceSelection,
  isHealthyReviewDesktop,
} from "@review/node/desktop-discovery";
import { vi } from "vitest";

/**
 * One place for the filesystem scaffolding every Review test needs. Vitest runs
 * this package with `isolate: false` and `maxWorkers: 1`, so a stubbed env
 * variable outlives the file that set it: cleanupTempDirs unstubs as well as
 * deletes, and every suite that creates a directory here must call it.
 */
const trackedTempDirs: string[] = [];

export async function tempDir(prefix = "review-test-"): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  trackedTempDirs.push(dir);

  return dir;
}

export async function cleanupTempDirs(): Promise<void> {
  vi.unstubAllEnvs();
  await Promise.all(
    trackedTempDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
}

/** A selection over one record read; health still comes from `fetch`, as in production. */
export function selectingDesktop(
  read: () => Promise<ReviewDesktopDiscovery | null>,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  base: Pick<ReviewInstanceSelection, "key" | "source"> = {
    key: "stable",
    source: "fallback",
  },
): () => Promise<ReviewInstanceSelection> {
  return async () => {
    let discovery: ReviewDesktopDiscovery | null;

    try {
      discovery = await read();
    } catch (error) {
      return {
        ...base,
        instances: [],
        problem: error instanceof Error ? error : new Error(String(error)),
      };
    }

    if (!discovery) return { ...base, instances: [] };

    const instance = {
      key: base.key,
      filePath: "",
      discovery,
      healthy: await isHealthyReviewDesktop(discovery, fetch),
    };

    return { ...base, instance, instances: [instance] };
  };
}
