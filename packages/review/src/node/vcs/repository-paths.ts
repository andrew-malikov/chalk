import path from "node:path";

/** chalk's private directory inside a repo's shared git dir. */
export function chalkGitDir(gitCommonDir: string): string {
  // Keep the existing directory so saved review checkouts remain reachable.
  return path.join(gitCommonDir, "dev-fast");
}
