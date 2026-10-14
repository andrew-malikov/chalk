import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseVersion } from "./review-cli-release.mjs";
import { stageReviewDocs } from "./stage-review-assets.mjs";

/** Pack from the workspace, then add the docs and version metadata shipped by Desktop. */
export async function packReviewCli({ version, commit }, outputDirectory) {
  parseVersion(version);

  const actualCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();

  if (actualCommit !== commit)
    throw new Error("Release source differs from the planned commit");
  const output = path.resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const scratch = await mkdtemp(path.join(os.tmpdir(), "review-cli-pack-"));
  const manifestPath = "packages/cli/package.json";
  const original = await readFile(manifestPath, "utf8");

  try {
    const pkg = JSON.parse(original);
    pkg.version = version;
    pkg.gitHead = commit;
    await writeFile(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`);
    execFileSync(process.execPath, ["pm", "pack", "--destination", scratch], {
      cwd: "packages/cli",
      stdio: "inherit",
    });
    execFileSync("tar", [
      "-xzf",
      path.join(scratch, `chalk-cli-${version}.tgz`),
      "-C",
      scratch,
    ]);
    const staged = path.join(scratch, "package");
    await stageReviewDocs(staged);

    execFileSync(
      process.execPath,
      ["pm", "pack", "--ignore-scripts", "--destination", output],
      { cwd: staged, stdio: "inherit" },
    );

    return path.join(output, `chalk-cli-${version}.tgz`);
  } finally {
    await writeFile(manifestPath, original);
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plan = JSON.parse(await readFile("release-plan.json", "utf8"));
  console.log(
    await packReviewCli(plan, process.argv[2] || "release-artifacts"),
  );
}
