import { useTooltip } from "@canvas/lib/use-tooltip";
import { IconButton } from "@canvas/ui/button";
import type { ClassValue } from "clsx";
import { type ReactElement, useEffect, useState } from "react";

import { CheckIcon, CopyIcon as CopyGlyph } from "./icons";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);

    return true;
  } catch {
    // The workbench denies DOM clipboard permission requests.
  }

  const active = document.activeElement;
  const selection = document.getSelection();

  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) =>
        selection.getRangeAt(i).cloneRange(),
      )
    : [];

  const scratch = document.createElement("textarea");
  scratch.value = text;
  scratch.style.position = "fixed";
  scratch.style.opacity = "0";
  document.body.appendChild(scratch);
  scratch.select();
  let copied = false;

  try {
    copied = document.execCommand("copy");
  } catch {
    // The caller keeps its default label when the copy fails.
  }

  scratch.remove();

  if (active instanceof HTMLElement) active.focus();

  if (selection && ranges.length) {
    selection.removeAllRanges();

    for (const range of ranges) selection.addRange(range);
  }

  return copied;
}

/** The prompt cards' copy glyph. */
export function CopyIcon() {
  return <CopyGlyph className={styles.icon} />;
}

const COPIED_FOR_MS = 1200;

/** An icon button that copies `text` and shows a check while it is copied. */
export function CopyButton({
  text,
  label,
  className,
  iconClassName,
}: {
  text: string;
  label: string;
  className?: ClassValue;

  iconClassName: ClassValue;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const tooltip = useTooltip(label);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS);

    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <IconButton
      ref={tooltip}
      className={className}

      aria-label={label}
      data-copied={copied ? "" : undefined}
      onClick={() => {
        // The workbench denies DOM clipboard requests; copyText falls back to
        // execCommand and reports whether anything was copied.
        void copyText(text).then((ok) => {
          if (ok) setCopied(true);
        });
      }}
    >
      {copied ? (
        <CheckIcon className={iconClassName} />
      ) : (
        <CopyGlyph className={iconClassName} />
      )}
    </IconButton>
  );
}

const styles = {
  icon: "tw:size-[12px]",
};
