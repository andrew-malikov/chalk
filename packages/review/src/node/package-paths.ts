import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { jsonObject, jsonString, parseJsonText } from "@chalk/json";

export function readPackageVersion(
  moduleUrl: string = import.meta.url,
): string {
  try {
    const packageJson = jsonObject(
      parseJsonText(
        readFileSync(
          path.join(findPackageRoot(moduleUrl), "package.json"),
          "utf8",
        ),
      ),
    );

    return jsonString(packageJson?.version) ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** `build-info.json` in a built package's `dist`, when present. */
export function readBuildInfo(distDirectory: string) {
  try {
    return jsonObject(
      parseJsonText(
        readFileSync(path.join(distDirectory, "build-info.json"), "utf8"),
      ),
    );
  } catch {
    return undefined;
  }
}

/** The build's commit; null from source, where an old `dist` may linger. */
export function readBuildCommit(moduleUrl: string): string | null {
  const dist = path.join(findPackageRoot(moduleUrl), "dist");

  if (!fileURLToPath(moduleUrl).startsWith(`${dist}${path.sep}`)) return null;

  return jsonString(readBuildInfo(dist)?.commit) ?? null;
}

/** Finds the package containing a source or bundled module URL. */
export function findPackageRoot(moduleUrl: string = import.meta.url): string {
  const currentDir = path.dirname(fileURLToPath(moduleUrl));
  let candidate = currentDir;

  while (true) {
    const directoryName = path.basename(candidate);

    if (directoryName === "src" || directoryName === "dist") {
      return path.dirname(candidate);
    }

    const parent = path.dirname(candidate);

    if (parent === candidate) return currentDir;
    candidate = parent;
  }
}
