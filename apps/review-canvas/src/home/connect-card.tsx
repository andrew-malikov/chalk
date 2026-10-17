import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { AGENT_LOGOS } from "@canvas/home/agent-logos";
import { cn } from "@canvas/lib/utils";
import { cliInstallReady } from "@canvas/settings/cli-install-status";
import { controlStyles } from "@canvas/styles/controls-styles";
import { CopyIcon, copyText } from "@canvas/ui/copy-text";
import { CheckIcon } from "@canvas/ui/icons";
import { OptionMenu } from "@canvas/ui/option-menu";
import {
  type ReviewCanvasInstallContent,
  type ReviewCliInstallTarget,
  ReviewCliInstallTargetSchema,
} from "@chalk/review-contracts";
import { useEffect, useRef, useState } from "react";

import { promptStyles } from "./prompt-styles";

export const TARGET_LABELS: Record<ReviewCliInstallTarget, string> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  pi: "Pi",
  omp: "oh-my-pi",
  copilot: "Copilot CLI",
};

/** The rest share the Other menu. */
const TAB_TARGETS = ["claude", "codex", "opencode"] as const;

const OTHER_TARGETS = ReviewCliInstallTargetSchema.options.filter(
  (target) => !TAB_TARGETS.some((tab) => tab === target),
);

export const REVIEW_CONNECT_TARGET_STORAGE_KEY = "chalk.review.connectTarget";

const COPIED_RESET_MS = 2000;

/** Lines of a prompt shown before the reader expands it. */
const COLLAPSED_LINES = 4;

type Mode = "prompt" | "plugin";

const MODES: ReadonlyArray<{ mode: Mode; label: string }> = [
  { mode: "prompt", label: "Paste a prompt" },
  { mode: "plugin", label: "Install the plugin" },
];

/**
 * One agent at a time: a paste-in prompt that has the agent add Chalk's MCP
 * server, or an install command for the published plugin.
 */
export function ConnectCard({
  install,
  onCopied,
}: {
  install: ReviewCanvasInstallContent;
  onCopied?: () => void;
}) {
  const { status } = install;

  const [target, setTarget] =
    useState<ReviewCliInstallTarget>(readStoredTarget);

  const [mode, setMode] = useState<Mode>("prompt");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const clearCopied = () => {
    setCopied(false);
    clearTimeout(resetTimer.current);
  };

  const selectTarget = (next: ReviewCliInstallTarget) => {
    setTarget(next);
    clearCopied();
    setExpanded(false);

    try {
      globalThis.localStorage?.setItem(REVIEW_CONNECT_TARGET_STORAGE_KEY, next);
    } catch {
      // The desktop can disable DOM storage; the in-memory selection still works.
    }
  };

  const selectMode = (next: Mode) => {
    setMode(next);
    clearCopied();
    setExpanded(false);
  };

  const agent = TARGET_LABELS[target];

  const plugin = status.connect.plugins[target];

  const text =
    mode === "prompt" ? status.connect.prompts[target] : plugin.command;

  const copy = (value: string) => {
    void copyText(value).then((ok) => {
      if (!ok) {
        return;
      }

      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
      onCopied?.();
    });
  };

  const noun = mode === "prompt" ? "prompt" : "install command";

  // Prompts run to a dozen lines; show the opening and let the reader expand.
  const collapsible = (text?.split("\n").length ?? 0) > COLLAPSED_LINES;

  const collapsed = collapsible && !expanded;

  if (!cliInstallReady(status)) {
    return (
      <section aria-label="Connect your agents">
        <p className={styles.note}>Install the chalk command in PATH first.</p>
      </section>
    );
  }

  return (
    <section aria-label="Connect your agents">
      <div
        className={cn(
          controlStyles.segmented,
          promptStyles.tabs,
          styles.agentTabs,
        )}
        role="group"
        aria-label="Agent"
      >
        {TAB_TARGETS.map((tab) => {
          const Logo = AGENT_LOGOS[tab];

          return (
            <ButtonPrimitive
              variant="ghost"
              size="xs"
              key={tab}
              type="button"
              className={cn(
                "tw:h-auto tw:whitespace-normal tw:font-normal",
                controlStyles.segment,
                controlStyles.segmentLarge,
                target === tab && controlStyles.segmentActive,
              )}
              aria-pressed={target === tab}
              onClick={() => selectTarget(tab)}
            >
              <Logo className={styles.logo} />
              {TARGET_LABELS[tab]}
            </ButtonPrimitive>
          );
        })}
        <OtherAgentMenu
          selected={OTHER_TARGETS.includes(target) ? target : undefined}
          onSelect={selectTarget}
        />
      </div>
      <div
        className={cn(controlStyles.segmented, promptStyles.tabs)}
        role="group"
        aria-label="Setup method"
      >
        {MODES.map(({ mode: tab, label }) => (
          <ButtonPrimitive
            variant="ghost"
            size="xs"
            key={tab}
            type="button"
            className={cn(
              "tw:h-auto tw:whitespace-normal tw:font-normal",
              controlStyles.segment,
              mode === tab && controlStyles.segmentActive,
            )}
            aria-pressed={mode === tab}
            onClick={() => selectMode(tab)}
          >
            {label}
          </ButtonPrimitive>
        ))}
      </div>
      {text ? (
        <>
          <div className={styles.bodyWrap}>
            <pre
              className={cn(
                promptStyles.body,
                collapsed && styles.collapsedBody,
              )}
              data-collapsed={collapsed}
            >
              {text.split(/(--[a-z][a-z-]*)/g).map((part, index) =>
                part.startsWith("--") ? (
                  <span className={styles.option} key={index}>
                    {part}
                  </span>
                ) : (
                  part
                ),
              )}
            </pre>
            {collapsed ? (
              <ButtonPrimitive
                variant="ghost"
                size="xs"
                type="button"
                className={cn(
                  "tw:h-auto tw:whitespace-normal tw:font-normal",
                  styles.expand,
                )}
                aria-expanded={false}
                onClick={() => setExpanded(true)}
              >
                Show full {noun}
              </ButtonPrimitive>
            ) : null}
          </div>
          <div className={promptStyles.actions}>
            {collapsible && expanded ? (
              <ButtonPrimitive
                variant="ghost"
                size="xs"
                type="button"
                className={cn(
                  "tw:h-auto tw:whitespace-normal tw:font-normal",
                  styles.collapse,
                )}
                aria-expanded={true}
                onClick={() => setExpanded(false)}
              >
                Show less
              </ButtonPrimitive>
            ) : null}
            <ButtonPrimitive
              variant="ghost"
              size="xs"
              type="button"
              className={cn(
                "tw:h-auto tw:whitespace-normal tw:font-normal",
                promptStyles.copy,
              )}
              aria-live="polite"
              aria-label={`${copied ? "Copied" : "Copy"} ${noun} for ${agent}`}
              onClick={() => copy(text)}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied
                ? "Copied"
                : `Copy ${mode === "prompt" ? "prompt" : "command"}`}
            </ButtonPrimitive>
          </div>
        </>
      ) : (
        <p className={promptStyles.body}>
          {`${plugin.label}\nInstall the chalk command first.`}
        </p>
      )}
      {status.error ? (
        <p className={promptStyles.error}>{status.error}</p>
      ) : null}
    </section>
  );
}

function OtherAgentMenu({
  selected,
  onSelect,
}: {
  selected: ReviewCliInstallTarget | undefined;
  onSelect(target: ReviewCliInstallTarget): void;
}) {
  const Logo = selected ? AGENT_LOGOS[selected] : undefined;

  return (
    <OptionMenu
      ariaLabel="Other agent"
      value={selected}
      options={OTHER_TARGETS.map((other) => {
        const OptionLogo = AGENT_LOGOS[other];

        return {
          value: other,
          label: TARGET_LABELS[other],
          icon: <OptionLogo />,
        };
      })}
      onChange={onSelect}
      triggerClassName={[
        controlStyles.segment,
        controlStyles.segmentLarge,
        styles.otherTrigger,
        selected !== undefined && controlStyles.segmentActive,
      ]}
      triggerProps={{ "aria-pressed": selected !== undefined }}
    >
      {Logo ? <Logo className={styles.logo} /> : null}
      {selected ? TARGET_LABELS[selected] : "Other…"}
    </OptionMenu>
  );
}

function readStoredTarget(): ReviewCliInstallTarget {
  try {
    const stored = ReviewCliInstallTargetSchema.safeParse(
      globalThis.localStorage?.getItem(REVIEW_CONNECT_TARGET_STORAGE_KEY),
    );

    if (stored.success) {
      return stored.data;
    }
  } catch {
    // Fall through to the default when DOM storage is unavailable.
  }

  return "claude";
}

const styles = {
  note: "tw:m-[0_0_8px] tw:text-[color:var(--review-home-meta)] tw:text-[length:12px]",
  // The prompt card's tabs, one agent at a time.
  agentTabs: "tw:flex-wrap tw:mb-[6px]",
  logo: "tw:size-[14px]",
  otherTrigger: "tw:pr-[6px]",
  bodyWrap: "tw:relative",
  collapsedBody:
    "tw:max-h-[calc(22px_*_4)] tw:overflow-hidden tw:[mask-image:linear-gradient(to_bottom,_#000_35%,_transparent)]",
  option: "tw:whitespace-nowrap",
  // Sits on the fade, centered, like a "show full prompt" pill.
  expand:
    "tw:absolute tw:bottom-0 tw:left-[50%] tw:[transform:translateX(-50%)] tw:p-[3px_12px] tw:border-[1px] tw:border-solid tw:border-[color:var(--review-home-rule-soft)] tw:[&:hover]:border-[color:var(--ink-muted)] tw:rounded-[999px] tw:bg-[color:var(--raised)] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:12px] tw:font-normal tw:leading-[18px] tw:cursor-pointer",
  collapse:
    "tw:mr-[auto] tw:p-0 tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:transparent] tw:text-[color:var(--ink-muted)] tw:[&:hover]:text-[color:var(--ink)] tw:font-[family-name:var(--font-sans)] tw:text-[length:12px] tw:font-normal tw:leading-[22px] tw:cursor-pointer",
};
