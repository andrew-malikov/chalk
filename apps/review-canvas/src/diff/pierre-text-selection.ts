import type { CodeViewLineSelection } from "@pierre/diffs";

/** Read native selections inside Pierre's shadow DOM as source line ranges. */
export function selectedPierreText(
  items: readonly { id: string; element: HTMLElement }[],
):
  | (CodeViewLineSelection & {
      anchor: { x: number; y: number };
      textRange: Range;
    })
  | null {
  const document = items[0]?.element.ownerDocument;
  const selection = document?.getSelection();

  if (!document || !selection || !selection.rangeCount) return null;

  const shadowRoots = items.flatMap((item) =>
    item.element.shadowRoot ? [item.element.shadowRoot] : [],
  );

  const selected =
    selection.getComposedRanges?.({ shadowRoots })[0] ??
    selection.getRangeAt(0);

  if (selected.collapsed) return null;

  const root = selected.startContainer.getRootNode();
  const item = items.find((item) => item.element.shadowRoot === root);

  if (!item || selected.endContainer.getRootNode() !== root) return null;

  const range = document.createRange();
  range.setStart(selected.startContainer, selected.startOffset);
  range.setEnd(selected.endContainer, selected.endOffset);

  if (!range.toString()) return null;

  const element = (node: Node) =>
    node instanceof Element ? node : node.parentElement;

  const code = element(range.startContainer)?.closest("[data-code]");

  if (!code || element(range.endContainer)?.closest("[data-code]") !== code)
    return null;

  const rows = [...code.querySelectorAll<HTMLElement>("[data-line]")].filter(
    (row) => {
      const contents = document.createRange();
      contents.selectNodeContents(row);

      return (
        range.compareBoundaryPoints(Range.START_TO_END, contents) > 0 &&
        range.compareBoundaryPoints(Range.END_TO_START, contents) < 0
      );
    },
  );

  const side = (row: HTMLElement) =>
    code.hasAttribute("data-deletions") ||
    row.dataset.lineType === "change-deletion"
      ? "deletions"
      : "additions";

  const first = rows[0];
  const last = rows.at(-1);

  if (!first || !last || rows.some((row) => side(row) !== side(first)))
    return null;

  // SAFETY: root is a mounted shadow root; Chromium's optional getter returns a Selection.
  const nativeSelection =
    (
      root as ShadowRoot & {
        getSelection?(): Selection | null;
      }
    ).getSelection?.() ?? selection;

  const backward =
    nativeSelection.focusNode === selected.startContainer &&
    nativeSelection.focusOffset === selected.startOffset;

  const focus = range.cloneRange();
  focus.collapse(backward);

  const rect =
    focus.getClientRects()[0] ??
    (backward ? range.getClientRects()[0] : [...range.getClientRects()].at(-1));

  if (!rect) return null;

  return {
    id: item.id,
    range: {
      start: Number(first.dataset.line),
      end: Number(last.dataset.line),
      side: side(first),
    },
    anchor: {
      // Clear of the pointer that just finished the drag.
      x: (backward ? rect.left : rect.right) + 16,
      y: rect.top + rect.height / 2,
    },
    textRange: range,
  };
}
