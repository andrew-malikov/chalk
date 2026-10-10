import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canvas/components/ui/popover";
import { useOptionalReviewSession } from "@canvas/host/review-session";
import { useTooltip } from "@canvas/lib/use-tooltip";
import { controlStyles } from "@canvas/styles/controls-styles";
import { captureUiEvent } from "@canvas/telemetry/ui-telemetry";
import { Button, IconButton } from "@canvas/ui/button";
import { copyText } from "@canvas/ui/copy-text";
import { ShareIcon } from "@canvas/ui/icons";
import { TextField } from "@canvas/ui/text-field";
import {
  type ReviewApiClient,
  ReviewApiError,
} from "@review/review-api/client";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { canvasQueryKeys } from "./canvas-query";

export const SharingContext = createContext<{
  client: ReviewApiClient;
  reviewId: string;
  version: number;
  sender?: string;
  cloneUrl?: string;
} | null>(null);

interface SharingAccount {
  account: { login: string; origin: string } | null;
  pending: boolean;
  error?: string;
}

/** The version a popover shares, frozen when it opens, and the idempotency
 * key the host deduplicates its upload by. */
interface ShareTarget {
  version: number;
  requestId: string;
}

const POLL_WHILE_PENDING_MS = 2000;

const actionError = (error: Error | null) =>
  error &&
  (error instanceof ReviewApiError && error.status < 500
    ? error.message
    : "Could not complete this action. Please retry.");

export function ShareControl() {
  const context = useContext(SharingContext);
  const session = useOptionalReviewSession();
  const queryClient = useQueryClient();
  const client = context?.client;
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ShareTarget>();
  const [copyError, setCopyError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const popover = useRef<HTMLDivElement>(null);
  const shared = context?.reviewId.startsWith("shared-");
  const accountKey = canvasQueryKeys.sharingAccount();

  // Read while the review is open, refreshed on focus, polled while pending.
  const accountQuery = useQuery({
    queryKey: accountKey,
    queryFn: client
      ? ({ signal }) => client.read<SharingAccount>("/sharing/account", signal)
      : skipToken,
    enabled: !shared,
    refetchInterval: (query) =>
      query.state.data?.pending ? POLL_WHILE_PENDING_MS : false,
    // Sign-in finishes in the browser, while this window is in the background.
    refetchIntervalInBackground: true,
  });

  const { refetch: refetchAccount } = accountQuery;
  const account = accountQuery.data;
  const signedIn = Boolean(account?.account);

  const label = shared
    ? `Shared${context?.sender ? ` by ${context.sender}` : " review"}`
    : "Share review";

  const tooltip = useTooltip(label);

  // The library's focus refresh follows visibility; this follows window focus.
  useEffect(() => {
    if (!client || shared) return;
    const refresh = () => void refetchAccount();

    window.addEventListener("focus", refresh);

    return () => window.removeEventListener("focus", refresh);
  }, [client, shared, refetchAccount]);

  // Links created this canvas, so reopening a shared version skips the upload.
  const link = useQuery<string>({
    queryKey: canvasQueryKeys.shareLink(target?.version),
    queryFn: skipToken,
    staleTime: Infinity,
    gcTime: Infinity,
  }).data;

  const login = useMutation({
    mutationFn: () => client!.post("/sharing/login", {}),
    onSuccess: async () => {
      // An older read must not end the wait this login starts.
      await queryClient.cancelQueries({ queryKey: accountKey });
      queryClient.setQueryData<SharingAccount>(accountKey, {
        account: null,
        pending: true,
      });
    },
  });

  const publish = useMutation({
    mutationFn: ({ version, requestId }: ShareTarget) =>
      context!.client.post<{ url: string }>("/sharing/publish", {
        reviewId: context!.reviewId,
        version,
        requestId,
      }),
    onSuccess: ({ url }, { version }) =>
      queryClient.setQueryData(canvasQueryKeys.shareLink(version), url),
    onError: (error) => {
      // The host forgot a stale login; show sign-in and upload again after it.
      if (error instanceof ReviewApiError && error.status === 401)
        void queryClient.invalidateQueries({ queryKey: accountKey });
    },
  });

  const upload = (next: ShareTarget) => {
    login.reset();
    publish.mutate(next, {
      onError: (error) => {
        if (!(error instanceof ReviewApiError)) return;

        // Failed verification revokes the staged share; retry as a new one.
        if (error.status === 422)
          setTarget((current) =>
            current?.requestId === next.requestId
              ? { ...current, requestId: crypto.randomUUID() }
              : current,
          );
      },
    });
  };

  // Upload once per opening; a failure waits for Retry or a new sign-in.
  useEffect(() => {
    if (open && signedIn && target && publish.isIdle && !link) upload(target);
  }, [open, signedIn, target, publish.isIdle, link]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);

    return () => clearTimeout(timer);
  }, [copied]);

  if (!context) return null;

  const error = copyError ?? actionError(publish.error ?? login.error);

  const accountError = accountQuery.isError
    ? "Could not read sign-in status."
    : undefined;

  const copy = async (url: string) => {
    if (!(await copyText(url))) {
      setCopyError("Copy the link below.");

      return;
    }

    setCopied(true);

    if (session) captureUiEvent(session, "review_shared");
  };

  return (
    <div ref={popover} className="tw:relative">
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (
            next &&
            !(publish.isPending && target?.version === context.version)
          ) {
            setTarget({
              version: context.version,
              requestId: crypto.randomUUID(),
            });
            publish.reset();
            login.reset();
            setCopyError(undefined);
            setCopied(false);
          }

          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <IconButton
            ref={tooltip}
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <ShareIcon xstyle={controlStyles.chromeIcon} />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent
          container={
            popover.current?.closest<HTMLElement>(".review-app") ??
            popover.current
          }
          align="end"
          aria-label={shared ? "Shared review" : "Share review"}
          className="tw:flex tw:w-[280px] tw:flex-col tw:gap-2 tw:px-3 tw:py-2.5 tw:font-[family-name:var(--chrome-font)] tw:text-xs"
        >
          {(error || accountError || account?.error) && (
            <p className="tw:m-0 tw:text-destructive" role="alert">
              {error ?? accountError ?? account?.error}
            </p>
          )}
          {shared ? (
            <>
              <p className="tw:m-0 tw:text-muted-foreground">{label}</p>
              <p className="tw:m-0 tw:text-muted-foreground">
                This is a read-only snapshot, available offline.
              </p>
            </>
          ) : signedIn ? (
            link ? (
              <>
                <TextField
                  className="tw:w-full"
                  aria-label="Share link"
                  readOnly
                  value={link}
                  onFocus={(event) => event.target.select()}
                />
                <Button variant="primary" onClick={() => void copy(link)}>
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </>
            ) : error ? (
              <Button
                variant="primary"
                onClick={() => target && upload(target)}
              >
                Retry
              </Button>
            ) : (
              <p className="tw:m-0 tw:text-muted-foreground">Uploading…</p>
            )
          ) : (
            account && (
              <>
                <Button
                  variant="primary"
                  disabled={
                    account.pending || login.isPending || publish.isPending
                  }
                  onClick={() => {
                    publish.reset();
                    login.mutate();
                  }}
                >
                  {account.pending
                    ? "Waiting for sign-in…"
                    : "Sign in to share"}
                </Button>
              </>
            )
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
