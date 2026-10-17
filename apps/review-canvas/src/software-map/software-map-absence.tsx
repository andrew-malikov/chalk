import { EmptyState } from "@canvas/ui/empty-state";
import type { CSSProperties, ReactElement } from "react";

import type { NormalizedSoftwareModel } from "./model";
import { softwareMapRootProps } from "./software-map-styles";

/** The CSS length for a size prop: bare numbers are pixel counts. */
export function softwareMapCssLength(value: number | string): string {
  return Number.isFinite(value) ? `${value}px` : `${value}`;
}

export function SoftwareMapUnavailable({
  title,
  height,
  className,
  variant,
}: {
  title?: string;
  height?: number | string;
  className?: string;
  variant?: "view";
}): ReactElement {
  // SAFETY: React passes "--*" keys through to style.setProperty; CSSProperties
  // only lacks an index signature for custom properties.
  const style =
    height === undefined
      ? undefined
      : ({
          "--software-map-empty-height": softwareMapCssLength(height),
        } as CSSProperties);

  return (
    <section
      {...softwareMapRootProps(className, variant)}
      aria-label={title ?? "Software map unavailable"}
      style={style}
    >
      <EmptyState
        variant="boxed"
        className={styles.unavailable}
        title="No software map for this repo yet"
        message={
          <>
            A software map adds a structural view of the systems, containers,
            and components in this repo. Author one with{" "}
            <code className={styles.code}>chalk map</code>. The rest of the
            document works without it.
          </>
        }
      />
    </section>
  );
}

export function SoftwareMapTopologyUnavailable({
  repoSoftwareMap,
  baseSoftwareMap,
  baseRef,
  headRef,
}: {
  repoSoftwareMap: NormalizedSoftwareModel | null;
  baseSoftwareMap: NormalizedSoftwareModel | null;
  baseRef?: string;
  headRef?: string;
}): ReactElement | null {
  const missingSides = [
    ...(!baseSoftwareMap ? [softwareMapSideLabel("base", baseRef)] : []),
    ...(!repoSoftwareMap ? [softwareMapSideLabel("head", headRef)] : []),
  ];

  if (missingSides.length === 0) return null;

  return (
    <p className={styles.topologyUnavailable} role="status">
      Structural diff unavailable: no software map at{" "}
      {missingSides.join(" or ")}.
    </p>
  );
}

function softwareMapSideLabel(
  side: "base" | "head",
  ref: string | undefined,
): string {
  return ref ? `${side} ${ref}` : side;
}

const styles = {
  unavailable: "tw:min-h-[var(--software-map-empty-height,_520px)]",
  code: "tw:p-[2px_5px] tw:rounded-[4px] tw:bg-[color:var(--well)] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-mono)] tw:text-[length:0.85em] tw:font-bold",
  topologyUnavailable:
    "tw:flex-[none] tw:m-0 tw:p-[7px_12px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:bg-[color:var(--tray)] tw:text-[color:var(--ink-faint)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:leading-[16px]",
};
