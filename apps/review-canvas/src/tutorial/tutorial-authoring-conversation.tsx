import { cn } from "@canvas/lib/utils";
import type { ReviewComponentProps } from "@review/documents/authoring";
import type { ReactElement } from "react";

export function TutorialAuthoringConversation({
  conversation,
}: ReviewComponentProps<"TutorialAuthoringConversation">): ReactElement {
  return (
    <details className={styles.conversation}>
      <summary className={styles.summary}>
        <span>{conversation.title}</span>
        <span className={styles.summaryNote}>
          Representative authoring conversation
        </span>
      </summary>
      <ol className={styles.messages}>
        {conversation.messages.map((message, index) => (
          <li
            key={`${message.role}-${index}`}
            data-role={message.role}
            className={cn(styles.message, index > 0 && styles.later)}
          >
            <span
              className={cn(
                styles.role,
                message.role === "assistant" && styles.assistant,
              )}
            >
              {message.role === "user" ? "You" : "Agent"}
            </span>
            <p className={styles.body}>{message.body}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}

const styles = {
  conversation:
    "tw:m-[18px_0_24px] tw:border-[1px] tw:border-solid tw:border-[color:var(--review-home-rule-soft)] tw:rounded-[10px] tw:bg-[color:color-mix(in_srgb,_var(--surface-raised)_76%,_transparent)]",
  summary:
    "tw:flex tw:items-baseline tw:justify-between tw:gap-[16px] tw:p-[12px_14px] tw:cursor-pointer tw:font-semibold",
  summaryNote:
    "tw:text-[color:var(--review-home-meta)] tw:text-[length:11px] tw:font-normal",
  messages:
    "tw:grid tw:gap-[12px] tw:m-0 tw:p-[0_14px_14px] tw:[list-style:none]",
  message:
    "tw:grid tw:grid-cols-[48px_minmax(0,_1fr)] tw:gap-[10px] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:15px] tw:leading-[1.72] tw:text-left",
  later: "tw:mt-[8px]",
  role: "tw:text-[color:var(--review-home-meta)] tw:text-[length:11px] tw:font-semibold tw:tracking-[0.04em] tw:uppercase",
  assistant: "tw:text-[color:var(--accent)]",
  body: "tw:m-[14px_0_0]",
};
