import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { newTabLinkProps } from "@canvas/documents/link-props";
import { welcomeType } from "@canvas/home/welcome-page.stylex";
import { cliInstallReady } from "@canvas/settings/cli-install-status";
import { chevronMarker } from "@canvas/styles/markers.stylex";
import { fontSize, fontWeight, radius } from "@canvas/styles/scale.stylex";
import { withClass } from "@canvas/styles/stylex-props";
import { tokens } from "@canvas/styles/tokens.stylex";
import { Button } from "@canvas/ui/button";
import { EmptyState } from "@canvas/ui/empty-state";
import { CheckIcon, DisclosureChevron } from "@canvas/ui/icons";
import { textStyles } from "@canvas/ui/text";
import {
  REVIEW_DISCORD_URL,
  type ReviewCanvasInstallContent,
  type ReviewCanvasOnboarding,
  type ReviewCanvasSetupActions,
  type ReviewCliInstallStatus,
} from "@chalk/review-contracts";
import * as stylex from "@stylexjs/stylex";
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
        <p {...stylex.props(styles.hint)}>
          {installed ? (
            `Installed at ${status?.shim.path ?? "~/.local/bin/chalk"}.`
          ) : cliBuildMissing ? (
            <>
              CLI build missing. If you’re running from source, run{" "}
              <code {...stylex.props(styles.hintCode)}>
                bun run --filter @chalk/cli build
              </code>{" "}
              from the repository root, then restart Chalk. Otherwise, reinstall
              Chalk.
            </>
          ) : status?.shim.installed ? (
            pathHint(status.shim.path)
          ) : (
            <>
              The <code {...stylex.props(styles.hintCode)}>chalk</code> CLI lets
              your agents talk to Chalk
            </>
          )}
        </p>
        {installDone ? <StepDoneButton label="Installed" primary /> : null}
        {installOffered ? (
          <Button
            variant="primary"
            size="large"
            xstyle={[styles.stepButton, installDone && styles.stepButtonNext]}
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
            xstyle={[
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
          <p role="alert" {...stylex.props(promptStyles.error)}>
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
          xstyle={styles.dismiss}
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
            <p {...stylex.props(styles.hint)}>
              Explore a sample session in three minutes.
            </p>
            {onOpenTutorial ? (
              <Button
                size="large"
                xstyle={styles.stepButton}
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
    <main {...withClass("review-home", homeStyles.page)}>
      <div {...stylex.props(homeStyles.scroll)}>
        <div {...stylex.props(homeStyles.content, styles.page)}>
          <div {...stylex.props(styles.columns)}>
            <div {...stylex.props(styles.intro)}>
              <span {...stylex.props(textStyles.eyebrow, styles.kicker)}>
                Welcome to Chalk
              </span>
              {updating ? (
                <>
                  <h1
                    {...withClass(
                      "review-onboarding-headline",
                      styles.headline,
                    )}
                  >
                    Chalk now connects to your agents over MCP
                  </h1>
                  <p {...stylex.props(styles.sub)}>
                    Install the Chalk plugin or add its MCP server to each agent
                    you use.
                  </p>
                </>
              ) : (
                <>
                  <h1
                    {...withClass(
                      "review-onboarding-headline",
                      styles.headline,
                    )}
                  >
                    Your codebase, explained by your agent.
                  </h1>
                  <p {...stylex.props(styles.sub)}>
                    Install the command then setup the MCP to get started.
                  </p>
                </>
              )}
              {updating && install ? (
                <Button
                  xstyle={styles.dismiss}
                  disabled={setupBusy || !canDismiss}
                  onClick={dismissUpdate}
                >
                  Dismiss
                </Button>
              ) : onClose ? (
                <Button
                  xstyle={styles.dismiss}
                  disabled={setupBusy || !canDismiss}
                  onClick={onClose}
                >
                  Close
                </Button>
              ) : null}
            </div>
            <ol {...stylex.props(styles.steps)}>
              {steps.map((step, index) => {
                const open = openStep === step.title && !step.disabled;

                return (
                  <li
                    key={step.title}
                    {...stylex.props(styles.step, open && styles.stepOpen)}
                    data-state={step.done ? "done" : "todo"}
                    data-open={open}
                  >
                    <ButtonPrimitive
                      variant="ghost"
                      size="xs"
                      type="button"
                      {...withClass(
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
                        {...stylex.props(
                          styles.stepTitle,
                          step.done && !open && styles.stepTitleDone,
                        )}
                      >
                        {step.label ?? step.title}
                      </span>
                      {step.note ? (
                        <span {...stylex.props(styles.stepNote)}>
                          {step.note}
                        </span>
                      ) : null}
                      <DisclosureChevron
                        expanded={open}
                        xstyle={styles.stepChevron}
                      />
                    </ButtonPrimitive>
                    {open ? (
                      <div {...stylex.props(styles.stepBody)}>{step.body}</div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
          <p {...stylex.props(styles.feedback)}>
            {updating
              ? "Thoughts on the rename or product direction?"
              : "Questions about getting started? Suggestions for new features?"}{" "}
            Ask us on{" "}
            <a
              {...stylex.props(styles.feedbackLink)}
              href={REVIEW_DISCORD_URL}
              {...newTabLinkProps(REVIEW_DISCORD_URL)}
            >
              Discord
            </a>
            .
          </p>
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
      xstyle={[styles.stepButton, styles.stepDone]}
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
      {...stylex.props(
        styles.badge,
        done && styles.badgeDone,
        open && styles.badgeOpen,
      )}
      data-done={done}
    >
      {done ? (
        <Check {...stylex.props(styles.badgeCheck)} aria-hidden="true" />
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

// Below this the fixed intro column would squeeze the steps until the agent
// rows overflow; stack the intro above them instead.
const stacked = "@media (max-width: 960px)";

// An intro column beside the step rail that owns the whole first-run flow.
const styles = stylex.create({
  page: {
    minHeight: "100%",
  },
  columns: {
    display: "flex",
    flexDirection: { default: null, [stacked]: "column" },
    gap: { default: "72px", [stacked]: "32px" },
    alignItems: "flex-start",
    paddingTop: "48px",
  },
  intro: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    width: { default: "380px", [stacked]: "auto" },
    flexShrink: 0,
  },
  kicker: {
    color: tokens.reviewHomeMeta,
  },
  headline: {
    margin: 0,
    color: tokens.ink,
    font: `${fontWeight.medium} ${welcomeType.headline}/46px ${tokens.fontSans}`,
  },
  sub: {
    margin: 0,
    color: tokens.reviewHomeMeta,
    fontSize: fontSize.ui,
    lineHeight: "21px",
  },
  dismiss: {
    alignSelf: "flex-start",
    marginTop: "4px",
  },
  steps: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    alignSelf: { default: null, [stacked]: "stretch" },
    gap: "12px",
    minWidth: 0,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  // One accordion item per step. The header is always visible; only the open
  // step renders a body, so a single step asks for attention at a time.
  step: {
    display: "flex",
    flexDirection: "column",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: tokens.reviewHomeRule,
    borderRadius: radius.surface,
  },
  stepOpen: {
    borderColor: tokens.reviewHomeRuleSoft,
    backgroundColor: tokens.tray,
  },
  stepHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "16px 20px",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    borderRadius: { default: null, ":focus-visible": radius.surface },
    color: "inherit",
    backgroundColor: tokens.transparent,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    opacity: { default: null, ":disabled": 0.5 },
    textAlign: "left",
    font: "inherit",
    outline: { default: null, ":focus-visible": `1px solid ${tokens.accent}` },
    outlineOffset: { default: null, ":focus-visible": "-2px" },
  },
  // The chevron closes the row: it sits in the trailing lane, after the note.
  stepChevron: {
    margin: "2px 2px 2px auto",
    stroke: tokens.reviewHomeMeta,
  },
  badge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    flexShrink: 0,
    borderRadius: radius.round,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: tokens.reviewHomeRuleSoft,
    color: tokens.reviewHomeMeta,
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
  },
  badgeDone: {
    borderColor: tokens.transparent,
    backgroundColor: `color-mix(in srgb, ${tokens.changeAdded} 18%, ${tokens.transparent})`,
  },
  badgeOpen: {
    borderColor: tokens.transparent,
    color: tokens.onAccent,
    backgroundColor: tokens.accent,
  },
  badgeCheck: {
    width: "10px",
    height: "10px",
    flexShrink: 0,
    fill: "none",
    stroke: tokens.changeAdded,
    strokeWidth: "1.5px",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  stepTitle: {
    color: tokens.ink,
    fontSize: fontSize.ui,
  },
  stepTitleDone: {
    color: tokens.reviewHomeMeta,
  },
  stepNote: {
    color: tokens.reviewHomeMeta,
    fontSize: fontSize.body,
  },
  stepBody: {
    display: "flex",
    flexDirection: "column",
    padding: "0 20px 18px",
  },
  stepButton: {
    alignSelf: "flex-start",
  },
  stepButtonNext: {
    marginLeft: "8px",
  },
  // A finished step's button stays at full strength.
  stepDone: {
    opacity: 1,
  },
  hint: {
    margin: "0 0 14px",
    maxWidth: "560px",
    color: tokens.inkMuted,
    font: `${fontSize.ui}/20px ${tokens.fontSans}`,
  },
  hintCode: {
    padding: "1px 5px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: tokens.reviewHomeRuleSoft,
    borderRadius: radius.small,
    color: tokens.ink,
    backgroundColor: tokens.controlBg,
    fontFamily: tokens.fontMono,
  },
  feedback: {
    margin: "auto 0 0",
    paddingTop: "48px",
    color: tokens.reviewHomeMeta,
    fontSize: fontSize.body,
    lineHeight: "20px",
  },
  feedbackLink: {
    color: tokens.accent,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
});
