import type { Frame } from "@review/documents/document";
import { selectionKey } from "@review/documents/lens-selection";

/** Matching identity: an explicit key, else the source range. React and
 * selection identity stay on `id`. */
export function frameIdentity(frame: Frame): string {
  return frame.key ?? selectionKey(frame.source);
}
