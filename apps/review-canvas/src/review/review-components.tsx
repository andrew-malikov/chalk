import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { CodePeekCard } from "@canvas/diff/CodePeek";
import { AuthoredCodeSurface } from "@canvas/documents/authored-code-surface";
import { documentStyles } from "@canvas/documents/document-styles";
import { newTabLinkProps } from "@canvas/documents/link-props";
import type { ReviewSectionSummary } from "@canvas/documents/review-section-summary";
import { drawStyles } from "@canvas/drawing/draw-styles";
import {
  activeTargetForScroll,
  scrollTailHeight,
} from "@canvas/lib/scroll-active-tracking";
import { cn } from "@canvas/lib/utils";
import { controlStyles } from "@canvas/styles/controls-styles";
import { chevronMarker } from "@canvas/styles/markers";
import { shellStyles } from "@canvas/styles/shell-styles";
import { useTutorialSection } from "@canvas/tutorial/tutorial-section-context";
import { IconButton } from "@canvas/ui/button";
import {
  CheckIcon,
  CloseIcon,
  DisclosureChevron,
  MapPinIcon,
} from "@canvas/ui/icons";
import { textStyles } from "@canvas/ui/text";
import type { ReviewComponentProps } from "@review/documents/authoring";
import type { ClassValue } from "clsx";
import type {
  CSSProperties,
  ComponentPropsWithoutRef,
  ReactElement,
  ReactNode,
  Ref,
} from "react";
import { useEffect, useRef, useState } from "react";

import { useReviewActions } from "./review-context";
import {
  useOptionalReviewPanelActor,
  useReviewPanel,
  useReviewPanelActor,
} from "./review-panel";
import type {
  GuidedTour,
  GuidedTourStop,
  PeekAnchor,
  ReviewPeekContent,
} from "./review-panel-model";
import { useReviewRoots } from "./review-root-context";
import { useReviewUiState } from "./review-ui-state";
import { useBottomSheetResize } from "./side-panel-resizer";
import { panelStyles, tourStyles } from "./side-panel-styles";

const TOUR_ACTIVE_TOP_SLACK_PX = 18;

/**
 * Shared shell for everything that docks into the right panel slot: side
 * peeks, commit diffs, and guided tours. Provides the uniform header (kicker,
 * title, close button), closes on Escape, and slides in with
 * the same animation everywhere. The panel occupies a grid column, so the
 * document reflows next to it instead of being overlaid.
 */
export function ReviewPanelFrame({
  label,
  title,
  onClose,
  closeLabel,
  titleAccessory,
  headerActions,
  floatingFooter,
  bodyRef,
  onBodyScroll,
  tour = false,
  docked = false,
  tray = false,
  children,
}: {
  label?: string;
  title?: string;
  onClose: () => void;
  closeLabel: string;
  titleAccessory?: ReactNode;
  /** Buttons beside the close button. */
  headerActions?: ReactNode;
  floatingFooter?: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  onBodyScroll?: () => void;
  tour?: boolean;
  docked?: boolean;
  /** On the tray, as a conversation is, with a quieter kicker. */
  tray?: boolean;
  children: ReactNode;
}) {
  const appRef = useReviewRoots()?.appRef;
  const panelMotion = useReviewPanel((state) => state.context.motion);

  const sheet = useBottomSheetResize({
    stateKey: "bottomSheetFraction",
    label: "Resize panel height",
    containerRef: appRef,
  });

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !appRef?.current) return;
      event.preventDefault();
      onClose();
    };

    document.addEventListener("keydown", closeOnEscape);

    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [appRef, onClose]);

  // SAFETY: `--side-panel-bottom-fraction` is a CSS custom property, which
  // React forwards to style.setProperty; the CSSProperties typings only omit
  // custom names.
  const panelStyle = {
    "--side-panel-bottom-fraction": sheet.fraction,
  } as CSSProperties;

  return (
    <aside
      className={cn(
        "side-panel",
        panelStyles.panel,
        !docked && panelStyles.sheet,
        panelMotion === "restored" && panelStyles.restored,
        tour && !docked && panelStyles.tour,
        docked && panelStyles.docked,
        tray && panelStyles.tray,
      )}
      aria-label={title ?? label}
      style={panelStyle}
    >
      <div className={shellStyles.sheetResizer} {...sheet.separatorProps} />
      <header className={cn(panelStyles.header, tray && panelStyles.tray)}>
        <div className={panelStyles.title}>
          {label && (
            <span
              className={cn(
                textStyles.eyebrow,
                panelStyles.kicker,
                tray && panelStyles.trayKicker,
              )}
            >
              {label}
            </span>
          )}
          {title && <h2 className={panelStyles.heading}>{title}</h2>}
          {titleAccessory}
        </div>
        <div className={panelStyles.actions}>
          {headerActions}
          <IconButton
            size="large"
            className={panelStyles.close}
            onClick={onClose}
            aria-label={closeLabel}
          >
            <CloseIcon className={controlStyles.inertIcon} />
          </IconButton>
        </div>
      </header>
      <div
        ref={bodyRef}
        className={cn(panelStyles.body, tray && panelStyles.trayBody)}
        onScroll={onBodyScroll}
      >
        {children}
      </div>
      {floatingFooter}
    </aside>
  );
}

/**
 * Collapsible document section. The section owns its heading: it renders
 * `title` as the H2, with the id the projection pass assigned (or the heading
 * slug on the JSON path), and treats every child as body. Collapse state persists
 * per document+section in localStorage; sections marked `[collapsed]` in the
 * MDX start collapsed for first-time readers.
 */
export function ReviewSection({
  stateKey,
  title,
  defaultCollapsed = false,
  id,
  children,
  summary,
}: ReviewComponentProps<"ReviewSection"> & {
  stateKey?: string;
  id?: string;
  summary?: ReviewSectionSummary;
  children?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useReviewUiState(
    stateKey ?? title,
    defaultCollapsed,
    {
      scope: "session",
      namespace: "section",
    },
  );

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const tutorialSection = useTutorialSection(title);

  // The active tutorial chapter opens itself. Other chapters keep the
  // reader's own collapse state.
  useEffect(() => {
    if (tutorialSection.state === "active") setCollapsed(false);
  }, [setCollapsed, tutorialSection.state]);

  const toggleCollapsed = () => setCollapsed((current) => !current);

  // The table of contents (and anchor navigation) expands a collapsed
  // section before scrolling to a heading inside it.
  useEffect(() => {
    const bodyElement = bodyRef.current;
    const sectionElement = bodyElement?.parentElement;

    if (!sectionElement) return;
    const expand = () => setCollapsed(false);
    sectionElement.addEventListener("review-section-expand", expand);

    return () => {
      sectionElement.removeEventListener("review-section-expand", expand);
    };
  }, []);

  // The classes are markers: find, the code view and the section ring look
  // for a (collapsed) section, and the tutorial targets a section's body.
  return (
    <section
      className={cn(
        collapsed
          ? "review-section review-section--collapsed"
          : "review-section",
        sectionStyles.section,
        drawStyles.blockChild,
        drawStyles.sectionRing,
      )}
      data-review-section={title}
      data-tutorial-chapter-state={tutorialSection.state ?? undefined}
    >
      <div className={sectionStyles.header}>
        <IconButton
          size="small"
          className={[chevronMarker, sectionStyles.toggle]}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          onClick={toggleCollapsed}
        >
          <DisclosureChevron expanded={!collapsed} />
        </IconButton>
        <div className={cn("review-section-heading", sectionStyles.heading)}>
          <h2
            id={id}
            data-review-copy-prose
            className={cn(
              sectionStyles.title,
              tutorialSection.state === "active" && sectionStyles.titleActive,
              collapsed && sectionStyles.titleCollapsed,
              drawStyles.retitledHeading,
            )}
          >
            {title}
          </h2>
        </div>
        {collapsed && summary && (
          <span className={sectionStyles.meta}>
            {reviewSectionSummaryLabel(summary)}
          </span>
        )}
        {tutorialSection.state === "complete" && (
          <span className={sectionStyles.complete}>
            Complete <CheckIcon className={sectionStyles.completeIcon} />
          </span>
        )}
      </div>
      <div
        ref={bodyRef}
        className="review-section-body"
        hidden={collapsed || undefined}
      >
        {children}
      </div>
    </section>
  );
}

function reviewSectionSummaryLabel(summary: ReviewSectionSummary): string {
  const parts: string[] = [];

  if (summary.diagrams > 0) {
    parts.push(
      summary.diagrams === 1 ? "1 diagram" : `${summary.diagrams} diagrams`,
    );
  }

  if (summary.codeRefs > 0) {
    parts.push(
      summary.codeRefs === 1 ? "1 code ref" : `${summary.codeRefs} code refs`,
    );
  }

  if (parts.length === 0 && summary.paragraphs > 0) {
    parts.push(
      summary.paragraphs === 1
        ? "1 paragraph"
        : `${summary.paragraphs} paragraphs`,
    );
  }

  return parts.join(" · ");
}

interface ProsePeekAnchorProps {
  href: string;
  isOpen: boolean;
  onOpen: (text: string) => void;
  onAlreadyOpen?: () => void;
  className?: ClassValue;
  anchorId?: string;
  inertFallback?: ReactNode;
  children: ReactNode;
}

/**
 * Shared prose side-peek anchor primitive for source links.
 * Renders an inline anchor with open-state styling and visibility retention.
 */
export function ProsePeekAnchor({
  href,
  isOpen,
  onOpen,
  onAlreadyOpen,
  className,
  anchorId,
  inertFallback,
  children,
}: ProsePeekAnchorProps) {
  const panelActor = useOptionalReviewPanelActor();

  if (!panelActor && inertFallback !== undefined) {
    return <>{inertFallback}</>;
  }

  return (
    <a
      href={href}
      className={cn(documentStyles.link, className)}
      data-review-anchor-id={anchorId}
      data-review-anchor-open={isOpen ? "true" : undefined}
      onClick={(event) => {
        event.preventDefault();

        if (isOpen && onAlreadyOpen) {
          onAlreadyOpen();

          return;
        }

        onOpen(event.currentTarget.textContent?.trim() ?? "");
        keepAnchorLinkVisible(event.currentTarget);
      }}
    >
      {children}
    </a>
  );
}

export function AnchorLink({
  anchor,
  children,
}: ReviewComponentProps<"AnchorLink"> & { children?: ReactNode }) {
  const panelActor = useReviewPanelActor();

  const peekOpen = useReviewPanel(
    (state) =>
      state.context.active?.kind === "peek" &&
      state.context.active.anchor?.id === anchor.id,
  );

  return (
    <ProsePeekAnchor
      href={`#review-anchor-${anchor.id}`}
      anchorId={anchor.id}
      isOpen={peekOpen}
      onOpen={(text) => {
        panelActor.send({
          type: "openPeek",
          panel: {
            kind: "peek",
            anchor: { ...anchor, title: text || anchor.title },
            content: { kind: "source", source: anchor.peek },
          },
        });
      }}
    >
      {children}
    </ProsePeekAnchor>
  );
}

export function a({
  href,
  children,
  target,
  rel,
  ...props
}: ComponentPropsWithoutRef<"a">) {
  const linkProps = newTabLinkProps(href, { ...props, target, rel });

  return (
    <a href={href} target={target} rel={rel} {...props} {...linkProps}>
      {children}
    </a>
  );
}

/**
 * Opening the side panel narrows the document column and reflows the prose,
 * which can push the clicked anchor link out of the viewport. Once the panel
 * has slid in, scroll the link back into view if the reflow moved it away.
 */
function keepAnchorLinkVisible(link: HTMLElement) {
  window.setTimeout(() => {
    const rect = link.getBoundingClientRect();

    const visible =
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.left >= 0 &&
      rect.right <= window.innerWidth;

    if (!visible) {
      link.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, 240);
}

/** The only top-level renderer for Review's side peek. */
export function ReviewPanelHost() {
  const activePanel = useReviewPanel((state) => state.context.active);
  const panelActor = useReviewPanelActor();

  return (
    <>
      {activePanel ? (
        <ReviewPeekPanel
          anchor={activePanel.anchor}
          content={activePanel.content}
          onClose={() => panelActor.send({ type: "close" })}
        />
      ) : null}
    </>
  );
}

function ReviewPeekPanel({
  anchor,
  content,
  onClose,
}: {
  anchor?: PeekAnchor;
  content: ReviewPeekContent;
  onClose: () => void;
}) {
  if (!anchor) return null;

  return (
    <CodeReviewPeekPanel anchor={anchor} content={content} onClose={onClose} />
  );
}

function CodeReviewPeekPanel({
  anchor,
  content,
  onClose,
}: {
  anchor: PeekAnchor;
  content: Extract<
    ReviewPeekContent,
    { kind: "source" | "inline-code" | "explanation" }
  >;
  onClose: () => void;
}) {
  const { softwareMapEnabled, openSoftwareMapElement } = useReviewActions();

  return (
    <ReviewPanelFrame
      label="Peek"
      title={anchor.title}
      onClose={onClose}
      closeLabel="Close side peek"
    >
      <div className={panelStyles.peekBody}>
        {softwareMapEnabled && anchor.softwareMapPath ? (
          <div className={panelStyles.peekActions}>
            <IconButton
              size="large"
              onClick={() => {
                openSoftwareMapElement(anchor.softwareMapPath!);
                onClose();
              }}
              aria-label={`Show ${anchor.title} in software map`}
            >
              <MapPinIcon className={controlStyles.inertIcon} />
            </IconButton>
          </div>
        ) : null}

        <div className={panelStyles.peekContent}>
          <ReviewPeekContentView anchor={anchor} content={content} />
        </div>
      </div>
    </ReviewPanelFrame>
  );
}

export function GuidedTourPanel({
  tour,
  activeAnchor,
  revealRequest,
  onActiveAnchorChange,
  onClose,
  docked = false,
}: {
  tour: GuidedTour;
  activeAnchor: string;
  revealRequest: number;
  onActiveAnchorChange: (anchor: string, options: { reveal: boolean }) => void;
  onClose: () => void;
  /** Keeps the panel in its column at every width (a diagram tour's pane). */
  docked?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const handledRevealRequestRef = useRef(0);

  const activeIndex = tour.stops.findIndex(
    (stop) => stop.anchor.id === activeAnchor,
  );

  const tailRef = useRef<HTMLDivElement | null>(null);
  const [tailHeight, setTailHeight] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    setHasScrolled(false);
  }, [tour.id]);

  // Scroll-syncing activates a stop when its top crosses the active line, so
  // the last stop must be able to reach it: the tail spacer grants exactly
  // the missing scroll room. Sized here because a CSS percentage cannot see
  // the scroller's height from inside auto-height feed content.
  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) return;
    const lastStop = tour.stops[tour.stops.length - 1];

    if (!lastStop) return;

    const measure = () => {
      const section = sectionRefs.current.get(lastStop.anchor.id);
      const tail = tailRef.current;

      if (!section || !tail) return;

      const lastTopInContent =
        section.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;

      setTailHeight(
        scrollTailHeight({
          lastTargetTop: lastTopInContent,
          slack: TOUR_ACTIVE_TOP_SLACK_PX,
          viewportHeight: scroller.clientHeight,
          contentHeightSansTail: scroller.scrollHeight - tail.offsetHeight,
        }),
      );
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    const content = scroller.firstElementChild;

    if (content) observer.observe(content);

    return () => observer.disconnect();
  }, [tour]);

  useEffect(() => {
    if (handledRevealRequestRef.current === revealRequest) return;
    handledRevealRequestRef.current = revealRequest;
    const scroller = scrollerRef.current;
    const section = sectionRefs.current.get(activeAnchor);

    if (!section || !scroller) return;

    const frame = requestAnimationFrame(() => {
      const scrollerTop = scroller.getBoundingClientRect().top;
      const sectionTop = section.getBoundingClientRect().top;
      // The tail's active line.
      scroller.scrollTo({
        top:
          scroller.scrollTop +
          sectionTop -
          scrollerTop -
          TOUR_ACTIVE_TOP_SLACK_PX,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [activeAnchor, revealRequest]);

  const displayIndex = Math.max(0, activeIndex);
  const lastIndex = tour.stops.length - 1;

  const stepTo = (index: number) => {
    const stop = tour.stops[index];

    if (!stop) return;
    onActiveAnchorChange(stop.anchor.id, { reveal: true });
  };

  const showIntroPill =
    !hasScrolled && displayIndex === 0 && tour.stops.length > 1;

  // The stop being read follows the shared scroll-tracking rule (see
  // scroll-active-tracking.ts), the same one the contents rail uses.
  const syncActiveStopToScroll = () => {
    setHasScrolled(true);
    const scroller = scrollerRef.current;

    if (!scroller) return;
    const scrollerRect = scroller.getBoundingClientRect();

    const nextAnchor = activeTargetForScroll(
      tour.stops.flatMap((stop) => {
        const section = sectionRefs.current.get(stop.anchor.id);

        return section
          ? [{ id: stop.anchor.id, top: section.getBoundingClientRect().top }]
          : [];
      }),
      scrollerRect.top,
      scrollerRect.top + scrollerRect.height / 2,
    );

    if (nextAnchor === null || nextAnchor === activeAnchor) return;
    onActiveAnchorChange(nextAnchor, { reveal: false });
  };

  return (
    <ReviewPanelFrame
      tour
      docked={docked}
      label="Tour"
      title={tour.title ?? "Guided tour"}
      onClose={onClose}
      closeLabel="Close guided tour"
      floatingFooter={
        tour.stops.length > 0 ? (
          <div className={tourStyles.floatingFooter}>
            {showIntroPill ? (
              <ButtonPrimitive
                variant="ghost"
                size="xs"
                type="button"
                className={cn(tourStyles.pill, tourStyles.pillIntro)}
                onClick={() => {
                  setHasScrolled(true);
                  stepTo(1);
                }}
              >
                <span>{tour.stops.length - 1} more steps</span>
                <span className={tourStyles.pillChevron} aria-hidden="true">
                  ↓
                </span>
              </ButtonPrimitive>
            ) : (
              <div
                className={tourStyles.pill}
                role="group"
                aria-label="Tour steps"
              >
                <IconButton
                  className={tourStyles.pillButton}
                  aria-label="Previous step"
                  disabled={displayIndex === 0}
                  onClick={() => stepTo(displayIndex - 1)}
                >
                  ↑
                </IconButton>
                <span className="tour-pill-count" aria-live="polite">
                  {displayIndex + 1}/{tour.stops.length}
                </span>
                <IconButton
                  className={tourStyles.pillButton}
                  aria-label="Next step"
                  disabled={displayIndex === lastIndex}
                  onClick={() => stepTo(displayIndex + 1)}
                >
                  ↓
                </IconButton>
              </div>
            )}
          </div>
        ) : null
      }
      bodyRef={scrollerRef}
      onBodyScroll={syncActiveStopToScroll}
    >
      <div className={tourStyles.feedShell}>
        <div className={cn(panelStyles.peekBody, tourStyles.feed)}>
          {tour.stops.map((stop, index) => {
            const isActive = stop.anchor.id === activeAnchor;

            return (
              <section
                key={stop.anchor.id}
                ref={(node) => {
                  if (node) sectionRefs.current.set(stop.anchor.id, node);
                  else sectionRefs.current.delete(stop.anchor.id);
                }}
                className={tourStyles.stop}
                data-review-anchor-id={stop.anchor.id}
              >
                <div className={tourStyles.rail}>
                  <div
                    className={cn(
                      tourStyles.railNumber,
                      isActive && tourStyles.railNumberActive,
                    )}
                  >
                    {index + 1}
                  </div>
                </div>
                <GuidedTourStopMain
                  stop={stop}
                  index={index}
                  total={tour.stops.length}
                  active={isActive}
                  onNativeFocus={() => {
                    if (stop.anchor.id === activeAnchor) return;
                    onActiveAnchorChange(stop.anchor.id, { reveal: false });
                  }}
                  onClose={onClose}
                />
              </section>
            );
          })}
          {tour.stops.length > 0 && (
            <>
              <div className={tourStyles.endCap}>
                <span>End of tour</span>
                <ButtonPrimitive
                  variant="ghost"
                  size="xs"
                  type="button"
                  className={tourStyles.endCapButton}
                  onClick={() => stepTo(0)}
                >
                  ↑ Back to step 1
                </ButtonPrimitive>
              </div>
              <div
                ref={tailRef}
                className={tourStyles.scrollTail}
                style={{ height: tailHeight }}
                aria-hidden="true"
              />
            </>
          )}
        </div>
      </div>
    </ReviewPanelFrame>
  );
}

function GuidedTourStopMain({
  stop,
  index,
  total,
  active,
  onNativeFocus,
  onClose,
}: {
  stop: GuidedTourStop;
  index: number;
  total: number;
  active: boolean;
  onNativeFocus: () => void;
  onClose: () => void;
}): ReactElement {
  const { softwareMapEnabled, openSoftwareMapElement } = useReviewActions();

  return (
    <div className={cn(tourStyles.main, active && tourStyles.mainActive)}>
      <header className={tourStyles.header}>
        <div>
          <div className={cn(textStyles.eyebrow, textStyles.count)}>
            Step {index + 1} of {total}
          </div>
          <div className={tourStyles.titleRow}>
            <h3
              className={cn(tourStyles.title, active && tourStyles.titleActive)}
            >
              {stop.label}
            </h3>
          </div>
          {stop.detail && <p className={tourStyles.detail}>{stop.detail}</p>}
        </div>
        {softwareMapEnabled && stop.anchor.softwareMapPath ? (
          <div className={panelStyles.peekActions}>
            <IconButton
              size="large"
              aria-label={`Show ${stop.anchor.title} in software map`}
              onClick={() => {
                openSoftwareMapElement(stop.anchor.softwareMapPath!);
                onClose();
              }}
            >
              <MapPinIcon className={controlStyles.inertIcon} />
            </IconButton>
          </div>
        ) : null}
      </header>

      <div className={cn(panelStyles.peekContent, tourStyles.content)}>
        <ReviewPeekContentView
          anchor={stop.anchor}
          content={stop.content}
          active={active}
          onNativeFocus={onNativeFocus}
        />
      </div>
    </div>
  );
}

function ReviewPeekContentView({
  anchor,
  content,
  active,
  onNativeFocus,
}: {
  anchor: PeekAnchor;
  content: ReviewPeekContent;
  active?: boolean;
  onNativeFocus?: () => void;
}) {
  if (content.kind === "explanation") return <p>{content.text}</p>;

  if (content.kind === "source") {
    return (
      <CodePeekCard
        source={content.source}
        active={active}
        heightMode="content"
        onNativeFocus={onNativeFocus}
      />
    );
  }

  if (content.kind === "inline-code") {
    return (
      <AuthoredCodeSurface
        anchor={anchor}
        code={content.text}
        language={content.language}
      />
    );
  }

  return null;
}

const sectionStyles = {
  section: "tw:relative tw:w-full",
  header:
    "tw:relative tw:flex tw:items-baseline tw:gap-[12px] tw:w-[min(100%,_var(--review-prose-max-width))] tw:max-w-[calc(100cqi_-_2_*_var(--review-document-padding-inline))] tw:my-[40px_12px] tw:mx-[auto]",
  // A finished tutorial chapter says so at the end of its heading row.
  complete:
    "tw:inline-flex tw:items-center tw:gap-[4px] tw:ml-[auto] tw:text-[color:var(--tutorial-ring)] tw:font-[family-name:var(--font-sans)] tw:text-[length:10px] tw:font-normal tw:leading-[16px]",
  completeIcon: "tw:size-[12px]",
  // Expanded sections keep a faint chevron so "this collapses" is legible
  // without hovering the header first.
  toggle: "tw:absolute tw:top-[4px] tw:left-[-29px]",
  heading: "tw:min-w-0",
  title:
    "tw:[&:is(.canvas-document:is(*)_*)]:scroll-mt-[24px] tw:m-0 tw:[&:is(.canvas-document:is(*)_*)]:text-[color:var(--ink)] tw:[&:is(.canvas-document:is(*)_*)]:font-[family-name:var(--font-sans)] tw:[&:is(.canvas-document:is(*)_*)]:text-[length:26px] tw:[&:is(.canvas-document:is(*)_*)]:font-medium tw:[&:is(.canvas-document:is(*)_*)]:leading-[32px]",
  titleActive: "tw:text-[color:var(--ink)]",
  titleCollapsed: "tw:text-[color:var(--ghost)]",
  meta: "tw:flex-[0_0_auto] tw:text-[color:var(--ink-faint)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:whitespace-nowrap",
};
