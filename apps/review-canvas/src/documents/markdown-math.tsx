import { cn } from "@canvas/lib/utils";
import katex from "katex";

import "katex/dist/katex.css";
import { type ReactElement, useLayoutEffect, useRef } from "react";

/** KaTeX builds DOM nodes, so Trusted Types holds. */
export function MarkdownMath({
  tex,
  display,
}: {
  tex: string;
  display: boolean;
}): ReactElement {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    // Untrusted TeX: the defaults refuse links, images, classes and styles.
    katex.render(tex, ref.current!, {
      displayMode: display,
      throwOnError: false,
    });
  }, [tex, display]);

  return <span ref={ref} className={cn(display && styles.display)} />;
}

const styles = {
  display: "tw:block tw:overflow-x-auto tw:overflow-y-hidden",
};
