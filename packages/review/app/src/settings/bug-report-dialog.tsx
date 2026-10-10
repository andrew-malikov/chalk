import { Checkbox } from "@canvas/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@canvas/components/ui/dialog";
import { Textarea } from "@canvas/components/ui/textarea";
import { useReviewSession } from "@canvas/host/review-session";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { useReviewContainer } from "@canvas/review/review-root-context";
import { controlStyles } from "@canvas/styles/controls-styles";
import {
  captureUiEvent,
  clientErrorName,
} from "@canvas/telemetry/ui-telemetry";
import { useTutorial } from "@canvas/tutorial/tutorial-context";
import { Button, IconButton } from "@canvas/ui/button";
import { BugIcon } from "@canvas/ui/icons";
import { useToast } from "@canvas/ui/toast";
import {
  type ReviewBugReportRequest,
  parseReviewBugReportResponse,
} from "@dev.fast/review-protocol";
import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  useId,
  useRef,
  useState,
} from "react";

import {
  ScreenshotTooLargeError,
  captureWindowScreenshot,
  imageFileFromDataTransfer,
  normalizeScreenshot,
} from "./bug-report-screenshot";

const MAX_DESCRIPTION_BYTES = 64 * 1024;

export function BugReportControl({
  captureScreenshot = captureWindowScreenshot,
}: {
  /** Captures the window when the dialog opens; tests inject a fake. */
  captureScreenshot?: typeof captureWindowScreenshot;
} = {}) {
  const session = useReviewSession();
  const id = useId();
  const reviewContainer = useReviewContainer();
  const portal = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tutorial = useTutorial();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [includeDiff, setIncludeDiff] = useState(true);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast, showToast: setToast } = useToast();
  const tooltip = useTooltip("Report a bug");
  const capturePending = useRef(false);
  const descriptionBytes = new TextEncoder().encode(description).byteLength;
  const canSend = descriptionBytes <= MAX_DESCRIPTION_BYTES && !sending;

  const reset = () => {
    setDescription("");
    setIncludeContext(true);
    setIncludeDiff(true);
    setScreenshot(null);
    setDropActive(false);
    setSending(false);
  };

  const cancel = () => {
    captureUiEvent(session, "bug_report_cancelled");
    reset();
    setOpen(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!canSend) return;
    setSending(true);

    try {
      const report: ReviewBugReportRequest = {
        description,
        include_review: includeContext,
        include_map: includeContext,
        include_diff: includeDiff,
        app_session_id: session.appSessionId,
        app_version: session.config.appVersion,
      };

      if (screenshot) {
        report.screenshot = {
          mime: "image/jpeg",
          base64: screenshot.slice("data:image/jpeg;base64,".length),
        };
      }

      const response = await session.fetch("/telemetry/bug-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        captureUiEvent(session, "bug_report_send_failed", {
          error_name: clientErrorName(new Error()),
        });
        setToast({
          kind: "error",
          text:
            response.status === 429
              ? "Too many reports. Try again later."
              : response.status === 413
                ? "The report is too large. Remove an attachment and try again."
                : "The report could not be sent. Try again.",
        });

        return;
      }

      const result = parseReviewBugReportResponse(body);

      if (!result.ok) throw new Error(result.error);
      setToast({
        kind: "success",
        text: "Bug report was sent.",
      });
      reset();
      setOpen(false);
    } catch (error) {
      captureUiEvent(session, "bug_report_send_failed", {
        error_name: clientErrorName(error),
      });
      setToast({
        kind: "error",
        text: "The report could not be sent. Try again.",
      });
    } finally {
      setSending(false);
    }
  };

  const attachScreenshot = async (image: Blob) => {
    try {
      const normalized = await normalizeScreenshot(image);

      if (!normalized) throw new Error("Screenshot could not be decoded.");
      setScreenshot(normalized);
    } catch (error) {
      setToast({
        kind: "error",
        text:
          error instanceof ScreenshotTooLargeError
            ? "The screenshot is too large. Use an image under 3 MiB."
            : "That image could not be attached. Use a PNG, JPEG, or WebP image.",
      });
    }
  };

  const pasteScreenshot = (event: ClipboardEvent<HTMLElement>) => {
    const image = imageFileFromDataTransfer(event.clipboardData);

    if (!image) return;
    event.preventDefault();
    void attachScreenshot(image);
  };

  const dropScreenshot = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDropActive(false);
    const image = imageFileFromDataTransfer(event.dataTransfer);

    if (!image) {
      setToast({
        kind: "error",
        text: "That image could not be attached. Use a PNG, JPEG, or WebP image.",
      });

      return;
    }

    void attachScreenshot(image);
  };

  const openDialog = async () => {
    if (tutorial || capturePending.current) return;
    capturePending.current = true;
    setCapturing(true);
    captureUiEvent(session, "bug_report_dialog_opened");
    let captured: string | null = null;

    try {
      captured = await captureScreenshot(session.bridge);
    } finally {
      setScreenshot(captured);
      setOpen(true);
      setCapturing(false);
      capturePending.current = false;
    }
  };

  return (
    <div ref={portal} className="tw:contents">
      <IconButton
        aria-label="Report a bug"
        ref={(element) => {
          trigger.current = element;

          return tooltip(element);
        }}
        disabled={tutorial !== null || capturing}
        onClick={() => void openDialog()}
      >
        <BugIcon xstyle={controlStyles.chromeIcon} />
      </IconButton>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) cancel();
        }}
      >
        <DialogContent
          container={reviewContainer ?? portal.current}
          showCloseButton={false}
          aria-describedby={undefined}
          className={`tw:max-h-[calc(100%-48px)] tw:overflow-y-auto tw:p-5 tw:sm:max-w-[540px] ${dropActive ? "tw:outline-2 tw:outline-dashed tw:outline-ring tw:outline-offset-[-7px]" : ""}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (sending) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (sending) event.preventDefault();
          }}
          onPaste={pasteScreenshot}
          onDragOver={(event) => {
            event.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={(event) => {
            const next = event.relatedTarget;

            if (next instanceof Node && event.currentTarget.contains(next)) {
              return;
            }

            setDropActive(false);
          }}
          onDrop={dropScreenshot}
        >
          <form className="tw:grid tw:gap-3.5" onSubmit={submit}>
            <DialogTitle id="bug-report-title">Report a bug</DialogTitle>
            <label
              htmlFor={`${id}-description`}
              className="tw:grid tw:gap-2 tw:text-xs tw:font-semibold"
            >
              <span>What happened? (optional)</span>
              <Textarea
                id={`${id}-description`}
                className="tw:resize-y tw:bg-[var(--control-bg)] tw:text-xs"
                autoFocus
                rows={7}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe what you expected and what happened."
              />
            </label>
            <div
              className={`tw:-mt-2.5 tw:text-right tw:font-mono tw:text-[10px] ${descriptionBytes > MAX_DESCRIPTION_BYTES ? "tw:text-[var(--diff-modified)]" : "tw:text-[var(--ink-faint)]"}`}
            >
              {descriptionBytes.toLocaleString()} / 65,536 bytes
            </div>
            <fieldset className="tw:m-0 tw:grid tw:gap-2 tw:rounded-sm tw:border tw:border-input tw:px-3 tw:pt-2.5 tw:pb-3">
              <legend className="tw:font-mono tw:text-[11px] tw:leading-normal">
                Include diagnostic attachments
              </legend>
              <label
                htmlFor={`${id}-context`}
                className="tw:flex tw:items-center tw:gap-2 tw:font-mono tw:text-[11px] tw:leading-normal"
              >
                <Checkbox
                  id={`${id}-context`}
                  checked={includeContext}
                  onCheckedChange={(checked) =>
                    setIncludeContext(checked === true)
                  }
                />
                Session
              </label>
              <label
                htmlFor={`${id}-diff`}
                className="tw:flex tw:items-center tw:gap-2 tw:font-mono tw:text-[11px] tw:leading-normal"
              >
                <Checkbox
                  id={`${id}-diff`}
                  checked={includeDiff}
                  onCheckedChange={(checked) =>
                    setIncludeDiff(checked === true)
                  }
                />
                Changed-file diffs used by CodePeeks
              </label>
              <div className="tw:flex tw:min-h-[54px] tw:items-center tw:gap-2 tw:rounded-sm tw:border tw:border-dashed tw:border-input tw:p-2">
                {screenshot ? (
                  <>
                    <img
                      className="tw:block tw:max-h-[72px] tw:max-w-[calc(100%-34px)] tw:rounded-sm tw:border tw:border-border"
                      src={screenshot}
                      alt="Screenshot preview"
                    />
                    <IconButton
                      className="tw:border tw:border-border tw:bg-muted tw:text-base tw:font-normal"
                      aria-label="Remove screenshot"
                      title="Remove screenshot"
                      onClick={() => setScreenshot(null)}
                    >
                      ×
                    </IconButton>
                  </>
                ) : (
                  <span className="tw:font-mono tw:text-[11px] tw:leading-normal tw:text-[var(--ink-faint)]">
                    Paste or drop an image to attach a screenshot.
                  </span>
                )}
              </div>
            </fieldset>
            <p className="tw:m-0 tw:font-mono tw:text-[11px] tw:leading-normal tw:text-[var(--ink-faint)]">
              Reports are sent securely to /dev/fast. Only authorized /dev/fast
              team members can access them. Reports are deleted after 90 days.
              The screenshot above is included unless you remove it.
            </p>
            <div className="tw:flex tw:justify-end tw:gap-2">
              <Button
                size="large"
                className="tw:min-w-[76px]"
                onClick={cancel}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="large"
                className="tw:min-w-[76px]"
                disabled={!canSend}
              >
                {sending ? "Sending..." : "Send"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {toast}
    </div>
  );
}
