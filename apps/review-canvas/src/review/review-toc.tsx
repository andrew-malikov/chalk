import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import type { ReviewTocEntry } from "@canvas/documents/review-document-headings";
import {
  cssIdentifier,
  getReviewScrollRoot,
  scrollToReviewHeading,
} from "@canvas/documents/review-heading-scroll";
import {
  activeTargetForScroll,
  scrollTailHeight,
} from "@canvas/lib/scroll-active-tracking";
import { cn } from "@canvas/lib/utils";
import { tocEntryMarker } from "@canvas/styles/markers";
import { IconButton } from "@canvas/ui/button";
import { ContentsIcon } from "@canvas/ui/icons";
import { surfaceStyles } from "@canvas/ui/surface";
import { textStyles } from "@canvas/ui/text";
import type { ReviewDocumentWidthChoice } from "@chalk/review-contracts";
import { type ReactElement, useEffect, useState } from "react";

import { useReviewRoots } from "./review-root-context";

interface NumberedReviewTocEntry extends ReviewTocEntry {
  number: string;
}

/**
 * Narrowest shell that fits the rail beside the prose: the 720px prose
 * measure sits centered, so each gutter is (shell - 720) / 2, and the rail
 * needs left offset (24) + card (up to ~286 with padding) + breathing room
 * before the text starts — a ~320px gutter, so a 1360px shell. A wide
 * document needs the same gutter beside its 1232px block column; a full one
 * leaves none, so its contents stay a pill.
 */
const TOC_RAIL_MIN_SHELL_WIDTH: Record<ReviewDocumentWidthChoice, number> = {
  standard: 1360,
  wide: 1872,
  full: Infinity,
};

/**
 * Room to leave above the last heading once it is scrolled to the top, so
 * the tail spacer is no larger than it needs to be. Mirrors the tour feed.
 */
const TAIL_TOP_SLACK_PX = 24;

/** CSS custom property the scroll region reads for its tail padding. */
const TAIL_CSS_PROPERTY = "--review-toc-tail";

export function ReviewToc({
  entries,
  besideHeader = false,
  documentWidth = "standard",
}: {
  entries: readonly ReviewTocEntry[];
  /** The document opens with a review header: the rail lines up with the
   * page and sets its entries larger. A prop, not a :has() over the app,
   * which restyled every element on each change anywhere in it, such as
   * each keystroke in a text field. */
  besideHeader?: boolean;
  documentWidth?: ReviewDocumentWidthChoice;
}): ReactElement | null {
  const roots = useReviewRoots();
  const shellRef = roots?.shellRef;
  const scrollRegionRef = roots?.scrollRegionRef;
  const articleRef = roots?.articleRef;
  const [active, setActive] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isWide, setIsWide] = useState(false);

  // A wide shell keeps the rail beside the prose for the whole document; the
  // rail sits outside the scroll region, so it stays put while the reader
  // scrolls and only the active underline moves. When the shell narrows
  // (small window or open side panel), collapse to the breadcrumb pill.
  useEffect(() => {
    const shell = shellRef?.current;

    if (!shell) return;

    const updateWidth = () => {
      setIsWide(shell.clientWidth >= TOC_RAIL_MIN_SHELL_WIDTH[documentWidth]);
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(shell);

    return () => resizeObserver.disconnect();
  }, [shellRef, documentWidth]);

  useEffect(() => {
    if (isWide) setIsDrawerOpen(false);
  }, [isWide]);

  useEffect(() => {
    if (!isDrawerOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) return;

      if (target instanceof Element && target.closest("#review-toc")) return;

      setIsDrawerOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    setActive((current) =>
      entries.some((entry) => entry.id === current)
        ? current
        : (entries[0]?.id ?? null),
    );
  }, [entries]);

  useEffect(() => {
    if (entries.length < 2) {
      setActive(null);

      return;
    }

    // Entries are stable across MDX hydration and HMR remounts (same ids), so
    // this effect may never re-run after the document/scroll-root nodes are
    // replaced. Re-query on every update — and listen in capture phase at the
    // document level — so the tracking never binds to detached nodes.
    // The highlight follows the shared scroll-tracking rule (see
    // scroll-active-tracking.ts), the same one the tour feed uses, so a
    // click's instant jump lands on its entry without lighting up the ones
    // in between.
    const visibleHeadings = (article: HTMLElement) =>
      entries
        .flatMap((entry) => {
          const heading = article.querySelector<HTMLElement>(
            `#${cssIdentifier(entry.id)}`,
          );

          return heading ? [heading] : [];
        })
        .filter(isVisibleHeadingForActiveTracking);

    const updateActiveHeading = () => {
      const article = articleRef?.current;

      if (!article) return;
      const headings = visibleHeadings(article);

      const scrollRoot = getReviewScrollRoot(
        article,
        scrollRegionRef?.current ?? null,
      );

      const rootRect = scrollRoot?.getBoundingClientRect();
      const scrollerTop = rootRect?.top ?? 0;

      const halfLine = rootRect
        ? rootRect.top + rootRect.height / 2
        : window.innerHeight / 2;

      const nextActive = activeTargetForScroll(
        headings.map((heading) => ({
          id: heading.id,
          top: heading.getBoundingClientRect().top,
        })),
        scrollerTop,
        halfLine,
      );

      if (nextActive !== null) setActive(nextActive);
    };

    // The last heading can only reach the top edge if the scroll region has
    // room below it: the region reads this tail as extra bottom padding.
    const updateTail = () => {
      const article = articleRef?.current;
      const scrollRoot = scrollRegionRef?.current;

      if (!article || !scrollRoot) return;
      const lastHeading = visibleHeadings(article).at(-1);

      if (!lastHeading) return;

      const currentTail = Number.parseFloat(
        scrollRoot.style.getPropertyValue(TAIL_CSS_PROPERTY) || "0",
      );

      const lastTargetTop =
        lastHeading.getBoundingClientRect().top -
        scrollRoot.getBoundingClientRect().top +
        scrollRoot.scrollTop;

      const tail = scrollTailHeight({
        lastTargetTop,
        slack: TAIL_TOP_SLACK_PX,
        viewportHeight: scrollRoot.clientHeight,
        contentHeightSansTail: scrollRoot.scrollHeight - currentTail,
      });

      if (tail !== currentTail) {
        scrollRoot.style.setProperty(TAIL_CSS_PROPERTY, `${tail}px`);
      }
    };

    let frame: number | null = null;

    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateActiveHeading();
      });
    };

    let tailFrame: number | null = null;

    const scheduleTail = () => {
      if (tailFrame !== null) return;
      tailFrame = requestAnimationFrame(() => {
        tailFrame = null;
        updateTail();
        updateActiveHeading();
      });
    };

    document.addEventListener("scroll", scheduleUpdate, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", scheduleTail);
    updateTail();
    updateActiveHeading();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleTail);

    const scrollRoot = scrollRegionRef?.current;
    const article = articleRef?.current;

    if (resizeObserver && scrollRoot) resizeObserver.observe(scrollRoot);

    if (resizeObserver && article) resizeObserver.observe(article);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);

      if (tailFrame !== null) cancelAnimationFrame(tailFrame);
      resizeObserver?.disconnect();
      scrollRegionRef?.current?.style.removeProperty(TAIL_CSS_PROPERTY);
      document.removeEventListener("scroll", scheduleUpdate, {
        capture: true,
      });
      window.removeEventListener("resize", scheduleTail);
    };
  }, [articleRef, entries, scrollRegionRef]);

  if (entries.length < 2) return null;

  const scrollTo = (id: string) => {
    scrollToReviewHeading(
      id,
      articleRef?.current ?? null,
      scrollRegionRef?.current ?? null,
    );
    setActive(id);
    setIsDrawerOpen(false);
  };

  const numberedEntries = numberReviewTocEntries(entries);

  const showRail = isWide;
  const showList = showRail || isDrawerOpen;

  // On a narrow shell the nav is the pill: a 32px square holding only the
  // contents glyph, anchored where the pill has always sat. Opening does not
  // summon a second card; the same box grows in place, its top-left corner
  // pinned and the glyph still in it, until it is the contents card. The rail
  // on a wide shell is the same nav without the button. The key remounts the
  // nav, so a resize or zoom change swaps rail and pill without animating.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes the contents drawer from any focused entry.
    <nav
      key={showRail ? "rail" : "pill"}
      id="review-toc"
      className={cn(
        surfaceStyles.popover,
        styles.toc,
        showList && styles.tocOpen,
        showRail && styles.tocRail,
        showRail && besideHeader && styles.tocRailBesideHeader,
        showRail &&
          besideHeader &&
          documentWidth === "wide" &&
          styles.tocRailBesideWideHeader,
      )}
      aria-label="Contents"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setIsDrawerOpen(false);
        }
      }}
    >
      <IconButton
        size="large"
        className={[styles.toggle, showList && styles.toggleOpen]}
        aria-label={isDrawerOpen ? "Close contents" : "Open contents"}
        aria-expanded={isDrawerOpen}
        aria-controls="review-toc-body"
        hidden={showRail || undefined}
        onClick={() => setIsDrawerOpen((open) => !open)}
      >
        <ContentsIcon className={styles.toggleIcon} />
      </IconButton>
      <div
        id="review-toc-body"
        className={cn(
          styles.body,
          showList && styles.bodyOpen,
          showRail && styles.bodyRail,
        )}
      >
        <div
          className={cn(
            textStyles.eyebrow,
            styles.head,
            showRail && styles.headRail,
            showRail && besideHeader && styles.headRailBesideHeader,
          )}
        >
          Contents
        </div>
        <ul
          className={cn(
            styles.list,
            showRail && styles.listRail,
            showRail && besideHeader && styles.listRailBesideHeader,
          )}
        >
          {numberedEntries.map((entry) => (
            <li
              key={entry.id}
              className={cn(styles.item, entry.level === "h3" && styles.itemH3)}
            >
              <ButtonPrimitive
                variant="ghost"
                size="xs"
                type="button"
                aria-current={active === entry.id ? "location" : undefined}
                className={cn(
                  tocEntryMarker,
                  styles.link,
                  showRail && besideHeader && styles.linkRailBesideHeader,
                )}
                onClick={() => scrollTo(entry.id)}
              >
                <span
                  className={cn(
                    styles.number,
                    showRail && besideHeader && styles.numberRailBesideHeader,
                    entry.level === "h3" && styles.numberH3,
                  )}
                >
                  {entry.number}
                </span>
                <span className={styles.text}>{entry.text}</span>
              </ButtonPrimitive>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function numberReviewTocEntries(
  entries: readonly ReviewTocEntry[],
): NumberedReviewTocEntry[] {
  let sectionIndex = 0;
  let subsectionIndex = 0;

  return entries.map((entry) => {
    if (entry.level === "h2") {
      sectionIndex += 1;
      subsectionIndex = 0;

      return { ...entry, number: `${sectionIndex}` };
    }

    subsectionIndex += 1;

    return {
      ...entry,
      number: `${sectionIndex}.${subsectionIndex}`,
    };
  });
}

function isVisibleHeadingForActiveTracking(heading: HTMLElement): boolean {
  if (heading.closest("[hidden]")) return false;
  const rect = heading.getBoundingClientRect();

  return rect.width !== 0 || rect.height !== 0;
}

// On a narrow shell the nav is the pill and the card in one: a 32px square at
// the pill's anchor that grows in place, top-left corner pinned, into the
// 248px contents card. Width and height animate; the list only fades, late in
// and early out, so no frame shows stretching text. The radius holds at 10px
// so the eye tracks one shape. On a wide shell the same nav is the rail:
// always open, no button, no card chrome.
const styles = {
  toc: "tw:absolute tw:top-[calc(32px_+_var(--review-page-top))] tw:left-[24px] tw:[@media_(max-width:_720px)]:left-[8px] tw:z-[32] tw:block tw:flex-[none] tw:size-[32px] tw:overflow-hidden tw:p-0 tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:[interpolate-size:allow-keywords] tw:[transition:width_200ms_cubic-bezier(0.2,_0.7,_0.2,_1)_120ms,_height_200ms_cubic-bezier(0.2,_0.7,_0.2,_1)_120ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[transition:none]",
  tocOpen:
    "tw:w-[248px] tw:[@media_(max-width:_720px)]:w-[min(248px,_calc(100cqi_-_16px))] tw:h-auto tw:[transition:width_200ms_cubic-bezier(0.2,_0.7,_0.2,_1),_height_200ms_cubic-bezier(0.2,_0.7,_0.2,_1)] tw:[@media_(prefers-reduced-motion:_reduce)]:[transition:none]",
  // A wide shell renders the contents as a plain rail beside the prose,
  // without the floating-card chrome, for the whole document. It keeps the
  // card's inner layout but never grows or shrinks.
  tocRail:
    "tw:top-[calc(48px_+_var(--review-page-top)_+_40px)] tw:left-[24px] tw:[@media_(max-width:_720px)]:left-[8px] tw:z-[31] tw:w-[248px] tw:[@media_(max-width:_720px)]:w-[min(248px,_calc(100cqi_-_16px))] tw:overflow-visible tw:p-[20px_18px_22px_20px] tw:[transition:none] tw:border-[color:var(--transparent)] tw:bg-[color:var(--transparent)] tw:[box-shadow:none]",
  // Beside a review header the rail lines up with the left edge of a 1320px
  // page and gives each entry a taller row and larger type.
  tocRailBesideHeader:
    "tw:left-[max(24px,_calc((100%_-_1320px)_/_2))] tw:w-[240px] tw:p-[6px_0_0]",
  // Beside a wide document the page is its block column plus the same gutters.
  tocRailBesideWideHeader: "tw:left-[max(24px,_calc((100%_-_1792px)_/_2))]",
  toggle:
    "tw:absolute tw:top-0 tw:left-0 tw:inline-flex tw:[&:is([hidden])]:hidden",
  toggleOpen: "tw:text-[color:var(--ink)]",
  toggleIcon: "tw:flex-[0_0_auto]",
  body: "tw:max-h-[min(488px,_calc(100dvh_-_196px))] tw:overflow-auto tw:[scrollbar-width:thin] tw:opacity-0 tw:pointer-events-none tw:[transition:opacity_120ms_ease] tw:[@media_(prefers-reduced-motion:_reduce)]:[transition:opacity_120ms_ease]",
  bodyOpen:
    "tw:opacity-[1] tw:pointer-events-auto tw:[transition:opacity_120ms_ease_120ms] tw:[@media_(prefers-reduced-motion:_reduce)]:[transition:opacity_120ms_ease]",
  bodyRail: "tw:max-h-[min(520px,_calc(100dvh_-_164px))] tw:[transition:none]",
  // The card's first row is the pill's row: 32px tall, the label set in from
  // the glyph. The rail has no glyph, so its head sits flush.
  head: "tw:h-[32px] tw:pl-[32px] tw:font-[family-name:var(--font-sans)] tw:leading-[32px] tw:whitespace-nowrap",
  headRail: "tw:h-auto tw:mb-[14px] tw:pl-0 tw:leading-[normal]",
  headRailBesideHeader: "tw:pb-[10px] tw:pl-[14px]",
  list: "tw:grid tw:m-0 tw:p-[4px_18px_20px_20px] tw:[list-style:none] tw:gap-[6px]",
  listRail: "tw:p-0",
  listRailBesideHeader: "tw:gap-[4px]",
  item: "tw:m-0 tw:p-0",
  itemH3: "tw:pl-[14px]",
  link: "tw:flex tw:justify-start tw:items-baseline tw:w-full tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:var(--transparent)] tw:font-normal tw:[&:is([aria-current])]:font-semibold tw:text-left tw:relative tw:gap-[10px] tw:p-[2px_0] tw:rounded-none tw:text-[color:var(--ink-muted)] tw:[&:hover]:text-[color:var(--ink)] tw:[&:focus-visible]:text-[color:var(--ink)] tw:[&:is([aria-current])]:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:12px] tw:leading-[18px] tw:[&:hover]:[outline:none] tw:[&:focus-visible]:[outline:none] tw:[&:is([aria-current])]:[outline:none]",
  linkRailBesideHeader:
    "tw:min-h-[30px] tw:gap-[12px] tw:py-0 tw:text-[length:13px]",
  number:
    "tw:flex-[0_0_auto] tw:text-[color:var(--ink-faint)] tw:[&:is(.canvas-toc-entry:is([aria-current])_*)]:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:min-w-[22px] tw:text-[length:11px]",
  numberRailBesideHeader: "tw:min-w-[12px] tw:text-[length:12px]",
  // Fits "5.10".
  numberH3: "tw:min-w-[4ch]",
  text: "tw:min-w-0",
};
