import type { PeekAnchor } from "@canvas/review/review-panel-model";
import type { ReactElement } from "react";

/**
 * Authored inline code shown in a side peek or tour stop. Lines are numbered
 * from the anchor's authored range when it has one, otherwise from 1.
 */
export function AuthoredCodeSurface({
  anchor,
  code,
  language,
}: {
  anchor: PeekAnchor;
  code: string;
  language?: string;
}): ReactElement {
  const firstLine = anchor.peek?.start.line ?? 1;

  return (
    <div className={styles.block}>
      <pre className={styles.surface} data-language={language}>
        {code
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .map((text, index) => (
            <span className={styles.line} key={`line:${firstLine + index}`}>
              <span className={styles.gutter}>{firstLine + index}</span>
              <span className={styles.marker} aria-hidden="true">
                {" "}
              </span>
              <code>{text || " "}</code>
            </span>
          ))}
      </pre>
    </div>
  );
}

const styles = {
  block:
    "tw:relative tw:grid tw:grid-cols-[minmax(0,_1fr)] tw:min-w-0 tw:bg-[color:var(--bg)]",
  surface:
    "tw:relative tw:block tw:min-w-0 tw:m-0 tw:overflow-auto tw:bg-[color:var(--tray)] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-mono)] tw:text-[length:12px] tw:leading-[19px]",
  line: "tw:grid tw:min-w-0 tw:grid-cols-[42px_14px_minmax(0,_1fr)] tw:min-h-[19px] tw:whitespace-pre",
  gutter: "tw:p-[0_5px_0_16px] tw:text-[color:var(--ink-faint)] tw:text-right",
  marker: "tw:text-[color:var(--ink-faint)] tw:text-center",
};
