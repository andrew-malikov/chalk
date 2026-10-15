import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Audit the installed tree, including transitive dependencies, before publishing.
const developmentTool =
  /^(?:@playwright\/|@vitest\/|@vitejs\/|@electron\/|playwright(?:-core)?$|vitest$|vite$|vite-plus$|@voidzero-dev\/vite-plus(?:-|$)|electron$|tsdown$|tsx$|typescript$|esbuild$|@esbuild\/|@rolldown\/|rolldown$)/;

export function checkProductionDependencies(tree) {
  const packages = new Set();

  function visit(node, ancestors) {
    for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
      const chain = [...ancestors, name];

      if (developmentTool.test(name))
        throw new Error(
          `Development tooling in CLI production dependencies: ${chain.join(" -> ")}`,
        );

      if (dependency.version) packages.add(`${name}@${dependency.version}`);
      visit(dependency, chain);
    }
  }

  visit(tree, []);

  return packages.size;
}

// Inspect actual installed packages, including nested copies and optional binaries.
// Bun's pm ls is human-readable, so the audit reads manifests instead.
export async function readInstalledDependencies(root) {
  const dependencies = {};
  let entries;

  try {
    entries = await readdir(path.join(root, "node_modules"), {
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code === "ENOENT") return { dependencies };
    throw error;
  }

  const names = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    if (entry.name.startsWith("@")) {
      for (const name of await readdir(
        path.join(root, "node_modules", entry.name),
      ))
        names.push(`${entry.name}/${name}`);
    } else names.push(entry.name);
  }

  for (const name of names) {
    const packageRoot = path.join(root, "node_modules", name);

    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    );

    dependencies[name] = {
      version: manifest.version,
      ...(await readInstalledDependencies(packageRoot)),
    };
  }

  return { dependencies };
}
