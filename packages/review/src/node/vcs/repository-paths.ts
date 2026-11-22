import path from "node:path";

/** chalk's private directory inside a repo's shared git dir. */
export function chalkGitDir(gitCommonDir: string): string {
  return path.join(gitCommonDir, "chalk");
}
