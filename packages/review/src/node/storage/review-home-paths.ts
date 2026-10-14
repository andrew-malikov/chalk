import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

/** `<basename>-<12 hex>` of a resolved path, one safe storage segment. */
function hashedSegment(target: string, fallback: string): string {
  const resolved = path.resolve(target);
  const basename = safeStorageSegment(path.basename(resolved) || fallback);

  const hash = crypto
    .createHash("sha256")
    .update(resolved)
    .digest("hex")
    .slice(0, 12);

  return `${basename}-${hash}`;
}

/** Encode a value as one filesystem-safe storage path segment. */
export function safeStorageSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "__");
}

export function reviewDesktopRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(devReviewHome(env), "review-desktop");
}

/** Written by Desktops that predate instance selection. */
export function reviewLegacyDiscoveryPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(reviewDesktopRoot(env), "server.json");
}

export function reviewInstancesDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(reviewDesktopRoot(env), "instances");
}

export function reviewInstanceDiscoveryPath(
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(reviewInstancesDir(env), `${key}.json`);
}

export function reviewDefaultInstancePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(reviewDesktopRoot(env), "default-instance");
}

/** `dev-<name>-<hash>` identifies a development checkout. */
export function reviewDevInstanceKey(checkout: string): string {
  return `dev-${hashedSegment(checkout, "checkout")}`;
}

export function reviewDesktopStateDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(reviewDesktopRoot(env), "state");
}

export const CHALK_REVIEW_HOME_ENV = "CHALK_REVIEW_HOME";

/**
 * The one resolver for the Review home directory. Every reader of
 * CHALK_REVIEW_HOME calls this, so an untrimmed or empty value cannot make two
 * modules disagree about the directory. An empty value means "use the
 * default".
 */
export function devReviewHome(
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = os.homedir(),
): string {
  const override = env[CHALK_REVIEW_HOME_ENV]?.trim();

  return override ? path.resolve(override) : path.join(homeDir, ".chalk");
}
