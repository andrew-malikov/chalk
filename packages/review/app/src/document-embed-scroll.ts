import { type RefObject, useEffect } from "react";

/** Route ordinary vertical gestures over diagrams to the document. Code peeks
 * use native scrolling so capped previews scroll before their parent document. */
export function useDocumentEmbedScroll(
  regionRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const region = regionRef.current;

    if (!region) return;

    return routeDocumentEmbedScroll(region);
  }, [regionRef]);
}

export function routeDocumentEmbedScroll(region: HTMLElement) {
  const onWheel = (event: WheelEvent) => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.deltaY === 0 ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
      !(event.target instanceof Element)
    )
      return;

    const embed = event.target.closest(
      ".sequence-diagram, .flow-diagram, .database-lens",
    );

    if (!embed?.closest(".review-document") || !region.contains(embed)) return;

    // Capture vertical gestures before diagrams or native overflow can
    // consume them. Leave horizontal and modified gestures to the embed.
    event.preventDefault();
    event.stopPropagation();
    const lineHeight = parseFloat(getComputedStyle(region).lineHeight) || 20;
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? lineHeight : 1;
    region.scrollBy({
      top:
        event.deltaY *
        (event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? region.clientHeight
          : unit),
      behavior: "instant",
    });
  };

  region.addEventListener("wheel", onWheel, { capture: true, passive: false });

  return () => region.removeEventListener("wheel", onWheel, { capture: true });
}
