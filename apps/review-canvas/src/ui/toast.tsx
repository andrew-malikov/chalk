import { useOptionalReviewSession } from "@canvas/host/review-session";
import { cn } from "@canvas/lib/utils";
import { shellStyles } from "@canvas/styles/shell-styles";
import { useCallback, useEffect, useState } from "react";

type ToastMessage = { kind: "success" | "error"; text: string };

export function useToast(durationMs = 6_000) {
  const session = useOptionalReviewSession();
  const [message, setMessage] = useState<ToastMessage | null>(null);

  const showToast = useCallback(
    (message: ToastMessage) => {
      if (session?.bridge.notify) session.bridge.notify(message);
      else setMessage(message);
    },
    [session],
  );

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), durationMs);

    return () => window.clearTimeout(timeout);
  }, [message, durationMs]);

  return {
    showToast,
    toast: message ? <Toast message={message} /> : null,
  };
}

function Toast({ message }: { message: ToastMessage }) {
  return (
    <div
      className={cn(shellStyles.topbarItem, styles.toast, styles[message.kind])}
      role="status"
    >
      {message.text}
    </div>
  );
}

const styles = {
  // Notification colors on purpose: it reads as the host's own toast.
  toast:
    "tw:fixed tw:z-[10001] tw:right-[18px] tw:bottom-[18px] tw:max-w-[380px] tw:border-[0] tw:[&:is(.canvas-app:is(*)_*)]:border-[1px] tw:border-none tw:[&:is(.canvas-app:is(*)_*)]:border-solid tw:rounded-[8px] tw:p-[10px_12px] tw:bg-[color:var(--vscode-notifications-background,_var(--tray))] tw:[box-shadow:0_8px_24px_var(--shadow-color-strong)] tw:text-[color:var(--vscode-notifications-foreground,_var(--ink))] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[1.4]",
  success: "tw:border-[color:var(--diff-added)]",
  error: "tw:border-[color:var(--diff-modified)]",
};
