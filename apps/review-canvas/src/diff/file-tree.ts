export interface FileTreeRow<Entry> {
  depth: number;
  name: string;
  /** Absent on directory rows. */
  entry?: Entry;
}

interface Directory<Entry> {
  directories: Map<string, Directory<Entry>>;
  files: Entry[];
}

/** Lays changed files out as a directory tree, directories first, folding
 * single-child directory chains into one row like `src/diff`. */
export function fileTreeRows<Entry extends { file: { path: string } }>(
  entries: Entry[],
): FileTreeRow<Entry>[] {
  const root: Directory<Entry> = { directories: new Map(), files: [] };

  for (const entry of entries) {
    let directory = root;
    for (const part of entry.file.path.split("/").slice(0, -1)) {
      let next = directory.directories.get(part);
      if (!next) {
        next = { directories: new Map(), files: [] };
        directory.directories.set(part, next);
      }
      directory = next;
    }
    directory.files.push(entry);
  }

  const rows: FileTreeRow<Entry>[] = [];
  const walk = (directory: Directory<Entry>, depth: number) => {
    for (let [name, child] of directory.directories) {
      while (child.files.length === 0 && child.directories.size === 1) {
        const [[nextName, next]] = child.directories;
        name += `/${nextName}`;
        child = next;
      }
      rows.push({ depth, name });
      walk(child, depth + 1);
    }
    for (const entry of directory.files) {
      rows.push({ depth, name: entry.file.path.split("/").at(-1)!, entry });
    }
  };
  walk(root, 0);

  return rows;
}
