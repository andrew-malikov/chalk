import { findReviewPackageRoot } from "@review/package-paths";

export type InstallTarget =
  | "claude"
  | "codex"
  | "opencode"
  | "pi"
  | "omp"
  | "copilot";

export const ALL_INSTALL_TARGETS: InstallTarget[] = [
  "claude",
  "codex",
  "opencode",
  "pi",
  "omp",
  "copilot",
];

export function isInstallTarget(value: string): value is InstallTarget {
  return ALL_INSTALL_TARGETS.some((target) => target === value);
}

export function defaultPackageRoot(): string {
  return findReviewPackageRoot(import.meta.url);
}
