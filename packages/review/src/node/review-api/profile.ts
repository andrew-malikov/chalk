import { mkdir } from "node:fs/promises";
import path from "node:path";

import { withFileLock } from "@review/node/lib/with-file-lock";

import { openLocalReviewStore } from "./local-data.js";

/** Both hosts open the shared store under the same startup lock. */
export async function openReviewProfile(
  home: string,
  options: { manageWorkspaces: boolean },
) {
  await mkdir(home, { recursive: true, mode: 0o700 });

  const outcome = await withFileLock(
    path.join(home, ".review-profile-startup"),
    {
      retryMs: 50,
      timeoutMs: 10_000,
      staleMs: Infinity,
      unownedGraceMs: 1_000,
    },
    async () => openLocalReviewStore(path.join(home, "review-api.db"), options),
  );

  if (!outcome.acquired)
    throw new Error(
      "Another Review process is initializing this profile. Retry shortly.",
    );

  return outcome.result;
}
