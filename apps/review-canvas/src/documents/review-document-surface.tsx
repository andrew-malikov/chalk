import type { ComponentProps, ReactElement } from "react";

import { ReviewDocumentMetaLine } from "./review-doc-meta";

export function ReviewDocumentTitle({
  children,
  ...props
}: ComponentProps<"h1">): ReactElement {
  return (
    <ReviewDocumentMetaLine>
      <h1 {...props} data-review-copy-prose className={styles.title}>
        {children}
      </h1>
    </ReviewDocumentMetaLine>
  );
}

const styles = {
  title:
    "tw:[&:is(.canvas-document:is(*)_*)]:w-full tw:[&:is(.canvas-document:is(*)_*)]:max-w-[1000px] tw:[&:is(.canvas-document:is(*)_*)]:m-0 tw:[&:is(.canvas-document:is(*)_*)]:text-[color:var(--ink)] tw:[&:is(.canvas-document:is(*)_*)]:font-[family-name:var(--font-sans)] tw:[&:is(.canvas-document:is(*)_*)]:text-[length:32px] tw:[&:is(.canvas-document:is(*)_*)]:font-medium tw:[&:is(.canvas-document:is(*)_*)]:leading-[38px] tw:[&:is(.canvas-document:is(*)_*)]:tracking-[-0.015em] tw:[&:is(.canvas-document:is(*)_*)]:text-left",
};
