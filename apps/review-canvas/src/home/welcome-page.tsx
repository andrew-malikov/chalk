import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { cn } from "@canvas/lib/utils";
import { cliInstallReady } from "@canvas/settings/cli-install-status";
import { chevronMarker } from "@canvas/styles/markers";
import { Button } from "@canvas/ui/button";
import { EmptyState } from "@canvas/ui/empty-state";
import { CheckIcon, DisclosureChevron } from "@canvas/ui/icons";
import {
  type ReviewCanvasInstallContent,
  type ReviewCanvasOnboarding,
  type ReviewCanvasSetupActions,
  type ReviewCliInstallStatus,
} from "@chalk/review-contracts";
import { Check } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { ConnectCard } from "./connect-card";
import { homeStyles } from "./home-styles";
import { PromptCard } from "./prompt-card";
import { promptStyles } from "./prompt-styles";

export const REVIEW_CONNECT_COPIED_STORAGE_KEY = "chalk.review.connectCopied";

/** Long enough for a finished step's check to draw before the next opens. */
export const STEP_ADVANCE_DELAY_MS = 900;

/** First-run CLI installation and agent connection setup. */
export function WelcomePage({
  install: initialInstall,
  setupActions,
  onClose,
  onDismissUpdate,
  onboarding,
  onOpenTutorial,
}: {
  install?: ReviewCanvasInstallContent;
  setupActions?: ReviewCanvasSetupActions;
  onClose?: () => void;
  onDismissUpdate?: () => void;
  onboarding?: ReviewCanvasOnboarding;
  onOpenTutorial?: () => void;
}) {
  const [loadedInstall, setLoadedInstall] =
    useState<ReviewCanvasInstallContent>();

  const [setupError, setSetupError] = useState<string>();
  const [setupBusy, setSetupBusy] = useState(false);
  const install = loadedInstall ?? initialInstall;

  const runSetup = async (action: () => Promise<void>) => {
    setSetupBusy(true);
    setSetupError(undefined);

    try {
      await action();
    } catch (cause) {
      setSetupError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSetupBusy(false);
    }
  };

  /* The host renders this pane once per open, so an action taken while it is
     on screen has to advance the rail itself. Each action hands back the
     refreshed status; until the first one, the host's copy is correct. */
  const [cardStatus, setCardStatus] = useState<
    ReviewCliInstallStatus | undefined
  >(undefined);

  const status = cardStatus ?? install?.status;

  // The step a button just finished stays open while its check draws, then
  // hands over to the next one unless the reader opened another meanwhile.
  const [finishing, setFinishing] = useState<{ from: string; to?: string }>();

  useEffect(() => {
    if (!finishing) return;

    const timer = setTimeout(() => {
      setFinishing(undefined);
      setOpenStep((current) =>
        current === finishing.from ? finishing.to : current,
      );
    }, STEP_ADVANCE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [finishing]);

  const refreshInstall = async () => {
    if (!setupActions) return;
    const next = await setupActions.load();
    setLoadedInstall(next);

    if (cliInstallReady(next.status))
      setFinishing({
        from: "Install the chalk command",
        to: "Connect your agents",
      });
    setCardStatus(undefined);
  };

  const installed = cliInstallReady(status);
  const updating = status?.updateNeeded ?? false;
  const cliBuildMissing = status?.cli === null && !installed;

  // Chalk cannot see agent configs, so a copied prompt or command is the
  // closest signal that an agent got connected.
  const [connectCopied, setConnectCopied] = useState(readConnectCopied);
  const [updateFinished, setUpdateFinished] = useState(false);
  const [connectOpened, setConnectOpened] = useState(false);
  const canDismiss = installed && connectOpened;

  const markConnectCopied = () => {
    setConnectCopied(true);
    setFinishing({
      from: "Connect your agents",
      to: updating ? "Continue shipping thoughtful code" : "Take the tour",
    });

    try {
      globalThis.localStorage?.setItem(REVIEW_CONNECT_COPIED_STORAGE_KEY, "1");
    } catch {
      // The desktop can disable DOM storage; the in-memory flag still works.
    }
  };

  const tourChecked = onboarding?.tutorialChecked ?? 0;
  const tourTotal = onboarding?.tutorialTotal ?? 0;

  const installDone = finishing?.from === "Install the chalk command";

  const installOffered =
    setupActions !== undefined && !installed && !cliBuildMissing;

  const installStep: WelcomeStep = {
    title: "Install the chalk command",
    done: installed,
    body: (
      <>
        <p className={styles.hint}>
          {installed ? (
            `Installed at ${status?.shim.path ?? "~/.local/bin/chalk"}.`
          ) : cliBuildMissing ? (
            <>
              CLI build missing. If you’re running from source, run{" "}
              <code className={styles.hintCode}>
                bun run --filter @chalk/cli build
              </code>{" "}
              from the repository root, then restart Chalk. Otherwise, reinstall
              Chalk.
            </>
          ) : status?.shim.installed ? (
            pathHint(status.shim.path)
          ) : (
            <>
              The <code className={styles.hintCode}>chalk</code> CLI lets your
              agents talk to Chalk
            </>
          )}
        </p>
        {installDone ? <StepDoneButton label="Installed" primary /> : null}
        {installOffered ? (
          <Button
            variant="primary"
            size="large"
            className={[
              styles.stepButton,
              installDone && styles.stepButtonNext,
            ]}
            disabled={setupBusy}
            onClick={() =>
              void runSetup(async () => {
                await setupActions.installCli();
                await refreshInstall();
              })
            }
          >
            Install chalk in PATH
          </Button>
        ) : null}
        {setupActions &&
        (!install ||
          cliBuildMissing ||
          (status?.shim.installed && !installed)) ? (
          <Button
            size="large"
            className={[
              styles.stepButton,
              (installDone || installOffered) && styles.stepButtonNext,
            ]}
            disabled={setupBusy}
            onClick={() => void runSetup(refreshInstall)}
          >
            {setupBusy ? "Refreshing…" : "Refresh"}
          </Button>
        ) : null}
        {setupError ? (
          <p role="alert" className={promptStyles.error}>
            {setupError}
          </p>
        ) : null}
      </>
    ),
  };

  const dismissUpdate = () => {
    if (!install || !canDismiss) return;
    void runSetup(async () => {
      setCardStatus(await install.finishUpdate());
      setUpdateFinished(true);
      (onDismissUpdate ?? onClose)?.();
    });
  };

  const steps: WelcomeStep[] = [
    installStep,
    {
      title: "Connect your agents",
      disabled: !installed,
      done: connectCopied || updateFinished,
      note: "paste a prompt into each agent",
      body:
        install && status ? (
          <ConnectCard
            install={{ ...install, status }}
            onCopied={markConnectCopied}
          />
        ) : (
          <EmptyState message="Agent setup is unavailable." />
        ),
    },
  ];

  if (updating && install)
    steps.push({
      title: "Continue shipping thoughtful code",
      disabled: !canDismiss,
      done: updateFinished,
      body: (
        <Button
          variant="primary"
          size="large"
          className={styles.dismiss}
          disabled={setupBusy || !canDismiss}
          onClick={dismissUpdate}
        >
          Dismiss
        </Button>
      ),
    });

  if (!updating)
    steps.push(
      {
        title: "Take the tour",
        disabled: !installed,
        done: tourTotal > 0 && tourChecked >= tourTotal,
        note: onboarding
          ? `${tourChecked} of ${tourTotal} checks`
          : "a three-minute sample session",
        body: (
          <>
            <p className={styles.hint}>
              Explore a sample session in three minutes.
            </p>
            {onOpenTutorial ? (
              <Button
                size="large"
                className={styles.stepButton}
                onClick={onOpenTutorial}
              >
                {tourChecked > 0 ? "Reopen the tutorial" : "Open the tutorial"}
              </Button>
            ) : null}
          </>
        ),
      },
      {
        title: "Create your first session",
        disabled: !installed,
        done: onboarding?.published ?? false,
        note: onboarding?.published ? "published" : "your agent writes it",
        body: <PromptCard />,
      },
    );

  // Keep step identity stable as status and completion labels change.
  const [openStep, setOpenStep] = useState(() =>
    updating && installed
      ? "Connect your agents"
      : steps.find((step) => !step.done)?.title,
  );

  if (openStep && !steps.some((step) => step.title === openStep))
    setOpenStep(steps.find((step) => !step.done && !step.disabled)?.title);

  if (openStep === "Connect your agents" && installed && !connectOpened)
    setConnectOpened(true);

  return (
    <main className={cn("review-home", homeStyles.page)}>
      <div className={homeStyles.scroll}>
        <div className={cn(homeStyles.content, styles.page)}>
          <div className={styles.columns}>
            {updating || onClose ? (
              <div className={styles.intro}>
                {updating ? (
                  <>
                    <h1
                      className={cn(
                        "review-onboarding-headline",
                        styles.headline,
                      )}
                    >
                      Chalk now connects to your agents over MCP
                    </h1>
                    <p className={styles.sub}>
                      Install the Chalk plugin or add its MCP server to each
                      agent you use.
                    </p>
                  </>
                ) : null}
                {updating && install ? (
                  <Button
                    className={styles.dismiss}
                    disabled={setupBusy || !canDismiss}
                    onClick={dismissUpdate}
                  >
                    Dismiss
                  </Button>
                ) : onClose ? (
                  <Button
                    className={styles.dismiss}
                    disabled={setupBusy || !canDismiss}
                    onClick={onClose}
                  >
                    Close
                  </Button>
                ) : null}
              </div>
            ) : null}
            <ol className={styles.steps}>
              {steps.map((step, index) => {
                const open = openStep === step.title && !step.disabled;

                return (
                  <li
                    key={step.title}
                    className={cn(styles.step, open && styles.stepOpen)}
                    data-state={step.done ? "done" : "todo"}
                    data-open={open}
                  >
                    <ButtonPrimitive
                      variant="ghost"
                      size="xs"
                      type="button"
                      className={cn(
                        "tw:h-auto tw:whitespace-normal tw:font-normal",
                        chevronMarker,
                        styles.stepHeader,
                      )}
                      disabled={step.disabled}
                      aria-expanded={open}
                      aria-label={`${open ? "Collapse" : "Expand"} ${step.label ?? step.title}`}
                      onClick={() => setOpenStep(open ? undefined : step.title)}
                    >
                      <StepBadge
                        done={step.done}
                        open={open}
                        label={String(index + 1)}
                      />
                      <span
                        className={cn(
                          styles.stepTitle,
                          step.done && !open && styles.stepTitleDone,
                        )}
                      >
                        {step.label ?? step.title}
                      </span>
                      {step.note ? (
                        <span className={styles.stepNote}>{step.note}</span>
                      ) : null}
                      <DisclosureChevron
                        expanded={open}
                        className={styles.stepChevron}
                      />
                    </ButtonPrimitive>
                    {open ? (
                      <div className={styles.stepBody}>{step.body}</div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </main>
  );
}

function readConnectCopied(): boolean {
  try {
    return (
      globalThis.localStorage?.getItem(REVIEW_CONNECT_COPIED_STORAGE_KEY) ===
      "1"
    );
  } catch {
    return false;
  }
}

interface WelcomeStep {
  title: string;
  label?: string;
  done: boolean;
  disabled?: boolean;
  note?: string;
  body: ReactNode;
}

/** The button that finished a step, held while its check draws. */
function StepDoneButton({
  label,
  primary,
}: {
  label: string;
  primary?: boolean;
}) {
  return (
    <Button
      variant={primary ? "primary" : "secondary"}
      size="large"
      className={[styles.stepButton, styles.stepDone]}
      disabled
    >
      <CheckIcon />
      {label}
    </Button>
  );
}

function StepBadge({
  done,
  open,
  label,
}: {
  done: boolean;
  open: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        styles.badge,
        done && styles.badgeDone,
        open && styles.badgeOpen,
      )}
      data-done={done}
    >
      {done ? (
        <Check className={styles.badgeCheck} aria-hidden="true" />
      ) : (
        label
      )}
    </span>
  );
}

/** Windows has no shell profile to edit: its user PATH reaches new terminals. */
function pathHint(shimPath: string): string {
  if (/^[a-z]:[\\/]/i.test(shimPath) || /\.cmd$/i.test(shimPath))
    return "Open a new terminal, then refresh.";
  const directory = shimPath.replace(/[\\/][^\\/]*$/, "");

  return `Add ${directory || "~/.local/bin"} to PATH, then refresh.`;
}

// An intro column beside the step rail that owns the whole first-run flow.
const styles = {
  page: "tw:min-h-full tw:[container-name:review-welcome] tw:[container-type:inline-size]",
  columns:
    "tw:flex tw:[@container_review-welcome_(max-width:_880px)]:flex-col tw:gap-[72px] tw:[@container_review-welcome_(max-width:_880px)]:gap-[32px] tw:items-start tw:pt-[48px] tw:[@container_review-welcome_(max-width:_880px)]:pt-[8px]",
  intro:
    "tw:flex tw:flex-col tw:gap-[20px] tw:w-[380px] tw:[@container_review-welcome_(max-width:_880px)]:w-auto tw:shrink-0",
  headline:
    "tw:m-0 tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:38px] tw:font-medium tw:leading-[46px] tw:[@container_review-welcome_(max-width:_880px)]:font-[family-name:var(--font-sans)] tw:[@container_review-welcome_(max-width:_880px)]:text-[length:28px] tw:[@container_review-welcome_(max-width:_880px)]:font-medium tw:[@container_review-welcome_(max-width:_880px)]:leading-[34px]",
  sub: "tw:m-0 tw:text-[color:var(--review-home-meta)] tw:text-[length:13px] tw:leading-[21px]",
  dismiss: "tw:self-start tw:mt-[4px]",
  steps:
    "tw:flex tw:flex-[1] tw:flex-col tw:[@container_review-welcome_(max-width:_880px)]:self-stretch tw:gap-[12px] tw:min-w-0 tw:m-0 tw:p-0 tw:[list-style:none]",
  // One accordion item per step. The header is always visible; only the open
  // step renders a body, so a single step asks for attention at a time.
  step: "tw:flex tw:flex-col tw:border-[1px] tw:border-solid tw:border-[color:var(--review-home-rule)] tw:rounded-[10px]",
  stepOpen:
    "tw:border-[color:var(--review-home-rule-soft)] tw:bg-[color:var(--tray)]",
  stepHeader:
    "tw:flex tw:items-center tw:gap-[12px] tw:w-full tw:p-[16px_20px] tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:[&:focus-visible]:rounded-[10px] tw:text-[color:inherit] tw:bg-[color:var(--transparent)] tw:cursor-pointer tw:[&:disabled]:[cursor:not-allowed] tw:[&:disabled]:opacity-[0.5] tw:text-left tw:font-[family-name:inherit] tw:text-[length:inherit] tw:font-[number:inherit] tw:leading-[inherit] tw:[font-style:inherit] tw:[&:focus-visible]:[outline:1px_solid_var(--accent)] tw:[&:focus-visible]:outline-offset-[-2px]",
  // The chevron closes the row: it sits in the trailing lane, after the note.
  stepChevron: "tw:m-[2px_2px_2px_auto] tw:stroke-[var(--review-home-meta)]",
  badge:
    "tw:flex tw:items-center tw:justify-center tw:size-[22px] tw:shrink-0 tw:rounded-[50%] tw:border-[1px] tw:border-solid tw:border-[color:var(--review-home-rule-soft)] tw:text-[color:var(--review-home-meta)] tw:text-[length:11px] tw:font-medium",
  badgeDone:
    "tw:border-[color:var(--transparent)] tw:bg-[color:color-mix(in_srgb,_var(--change-added)_18%,_var(--transparent))]",
  badgeOpen:
    "tw:border-[color:var(--transparent)] tw:text-[color:var(--on-accent)] tw:bg-[color:var(--accent)]",
  badgeCheck:
    "tw:size-[10px] tw:shrink-0 tw:fill-[none] tw:stroke-[var(--change-added)] tw:stroke-[1.5px] tw:[stroke-linecap:round] tw:[stroke-linejoin:round]",
  stepTitle:
    "tw:shrink-0 tw:text-[color:var(--ink)] tw:text-[length:13px] tw:whitespace-nowrap",
  stepTitleDone: "tw:text-[color:var(--review-home-meta)]",
  // The note gives way first so the title stays on one line.
  stepNote:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--review-home-meta)] tw:text-[length:12px] tw:text-ellipsis tw:whitespace-nowrap",
  stepBody: "tw:flex tw:flex-col tw:p-[0_20px_18px]",
  stepButton: "tw:self-start",
  stepButtonNext: "tw:ml-[8px]",
  // A finished step's button stays at full strength.
  stepDone: "tw:opacity-[1]",
  hint: "tw:m-[0_0_14px] tw:max-w-[560px] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:text-[length:13px] tw:font-normal tw:leading-[20px]",
  hintCode:
    "tw:p-[1px_5px] tw:border-[1px] tw:border-solid tw:border-[color:var(--review-home-rule-soft)] tw:rounded-[6px] tw:text-[color:var(--ink)] tw:bg-[color:var(--control-bg)] tw:font-[family-name:var(--font-mono)]",
};
