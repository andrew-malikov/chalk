import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";

// The shell frames every page; these are the places a page fills with its own
// toolbar and overlays.
export interface PageSlots {
  toolbarStart: HTMLElement | null;
  toolbarEnd: HTMLElement | null;
  // Above the scroll region, so what sits there doesn't scroll with the page.
  overlay: HTMLElement | null;
  showToolbar(shown: boolean): void;
}

export const PageSlotsContext = createContext<PageSlots | null>(null);

export function usePageSlots(): PageSlots | null {
  return useContext(PageSlotsContext);
}

/** The page's toolbar controls, after the shared ones. */
export function PageToolbar({
  children,
}: {
  children: ReactNode;
}): ReactElement | null {
  const slots = usePageSlots();

  useShown(slots?.showToolbar);

  return slots?.toolbarEnd ? createPortal(children, slots.toolbarEnd) : null;
}

export function PageOverlay({
  children,
}: {
  children: ReactNode;
}): ReactElement | null {
  const overlay = usePageSlots()?.overlay;

  return overlay ? createPortal(children, overlay) : null;
}

// Before paint, so the shell lays out around the slot in the same frame.
function useShown(show: ((shown: boolean) => void) | undefined) {
  useLayoutEffect(() => {
    if (!show) return;
    show(true);

    return () => show(false);
  }, [show]);
}
