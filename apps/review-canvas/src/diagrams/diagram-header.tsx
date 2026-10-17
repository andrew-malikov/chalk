import { cn } from "@canvas/lib/utils";
import { Chip } from "@canvas/ui/chip";
import type { ClassValue } from "clsx";
import type { ReactNode } from "react";

import { diagramStyles } from "./diagram-styles";

export function DiagramHeader({
  kind,
  title,
  meta,
  action,
  className,
  metaClassName,
}: {
  kind: string;
  title?: string;
  meta?: string;
  action?: ReactNode;
  className?: ClassValue;
  metaClassName?: ClassValue;
}) {
  return (
    <figcaption className={cn(diagramStyles.header, className)}>
      <div className={diagramStyles.headerMain}>
        <Chip>{kind}</Chip>
        {title && (
          <span className={diagramStyles.title} data-review-copy-prose>
            {title}
          </span>
        )}
        {meta && (
          <em className={cn(diagramStyles.meta, metaClassName)}>{meta}</em>
        )}
      </div>
      {action}
    </figcaption>
  );
}
