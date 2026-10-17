const styles = {
  "review-find-match":
    "tw:[&::highlight(review-find-match)]:bg-[var(--review-find-match-background)]",
  "review-find-match-active":
    "tw:[&::highlight(review-find-match-active)]:bg-[var(--review-find-match-active-background)]",
};

export function setCssHighlight(
  root: HTMLElement | null | undefined,
  name: keyof typeof styles,
  ranges: readonly Range[],
  priority = 0,
): void {
  // SAFETY: Window omits these DOM types; jsdom also omits the runtime API.
  const view = root?.ownerDocument.defaultView as
    | (Window & {
        CSS?: { highlights?: HighlightRegistry };
        Highlight?: typeof Highlight;
      })
    | null
    | undefined;

  const registry = view?.CSS?.highlights;

  if (!root || !registry || !view?.Highlight) return;

  if (ranges.length) {
    const highlight = new view.Highlight(...ranges);
    highlight.priority = priority;
    registry.set(name, highlight);
  } else registry.delete(name);

  root.classList.toggle(styles[name], ranges.length > 0);
}
