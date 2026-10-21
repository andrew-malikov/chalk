import type { ReviewDiffFileWire } from "@chalk/review-contracts";
import type { GitStatusEntry } from "@pierre/trees";
import {
  FileTree,
  useFileTree,
  useFileTreeSelector,
} from "@pierre/trees/react";
import { type CSSProperties, useEffect, useRef } from "react";

import { compactDiffCount } from "./diff-count";

interface Props {
  files: ReviewDiffFileWire[];
  selectedPath: string | undefined;
  theme: "light" | "dark";
  onSelect(path: string): void;
}

/** Pierre's file tree over the changed files. The tree fixes its options when
 * built, so a new file set builds a new tree. */
export function ChangedFilesTree(props: Props) {
  return (
    <Tree
      key={props.files
        .map((file) => `${file.path}:${file.additions}:${file.deletions}`)
        .join("\n")}
      {...props}
    />
  );
}

function Tree({ files, selectedPath, theme, onSelect }: Props) {
  const shown = useRef(selectedPath);
  const select = useRef(onSelect);
  select.current = onSelect;

  const { model } = useFileTree({
    paths: files.map((file) => file.path),
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    icons: { set: "complete", colored: true },
    // Room after the last row so it doesn't sit on the sidebar's edge.
    unsafeCSS:
      '[data-file-tree-virtualized-scroll="true"]{padding-bottom:12px}',
    gitStatus: files.flatMap((file): GitStatusEntry[] =>
      file.status === "unchanged"
        ? []
        : [{ path: file.path, status: file.status }],
    ),
    renderRowDecoration: ({ item }) => {
      const file = files.find((file) => file.path === item.path);

      return file
        ? {
            text: "",
            parts: [
              {
                text: `+${compactDiffCount(file.additions)}`,
                color: "var(--diff-added)",
              },
              {
                text: ` −${compactDiffCount(file.deletions)}`,
                color: "var(--diff-removed)",
              },
            ],
          }
        : null;
    },
    onSelectionChange: (paths) => {
      const path = paths.at(-1);

      // Echoes of the scroll-driven sync below are not clicks.
      if (!path || path === shown.current || model.getItem(path)?.isDirectory())
        return;
      shown.current = path;
      select.current(path);
    },
  });

  // As tall as its rows plus the bottom padding; the popover caps it.
  const height = useFileTreeSelector(
    model,
    (model) => model.getVisibleCount() * model.getItemHeight() + 12,
  );

  useEffect(() => {
    if (!selectedPath) return;
    shown.current = selectedPath;

    for (const path of model.getSelectedPaths())
      if (path !== selectedPath) model.getItem(path)?.deselect();
    model.getItem(selectedPath)?.select();
    model.scrollToPath(selectedPath, { focus: false });
  }, [model, selectedPath]);

  return (
    <FileTree
      model={model}
      // SAFETY: the --trees-* keys are CSS custom properties, which React
      // forwards as-is; CSSProperties just doesn't list them.
      style={
        {
          height,
          minHeight: 0,
          colorScheme: theme,
          "--trees-bg-override": "transparent",
          "--trees-font-family-override": "var(--font-sans)",
        } as CSSProperties
      }
    />
  );
}
