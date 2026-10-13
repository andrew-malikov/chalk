import type {
  ReviewCanvasSettingsContent,
  ReviewCliInstallStatus,
  ReviewCtrlTabChoice,
  ReviewDocumentWidthChoice,
  ReviewKeymapChoice,
  ReviewReadyNotificationChoice,
  ReviewThemeChoice,
} from "@blackboard/review-protocol";
import { Switch } from "@canvas/components/ui/switch";
import { ConnectCard } from "@canvas/home/connect-card";
import { homeStyles } from "@canvas/home/home-styles";
import { withClass } from "@canvas/styles/stylex-props";
import { Button } from "@canvas/ui/button";
import { textStyles } from "@canvas/ui/text";
import * as stylex from "@stylexjs/stylex";
import { type ReactNode, useEffect, useState } from "react";

import { Choice } from "./settings-choice";
import { settingsStyles as styles } from "./settings-styles";

const THEME_LABELS: Record<ReviewThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const KEYMAP_LABELS: Record<ReviewKeymapChoice, string> = {
  none: "Default",
  vim: "Vim",
  emacs: "Emacs",
  sublime: "Sublime Text",
};

const CTRL_TAB_LABELS: Record<ReviewCtrlTabChoice, string> = {
  recent: "Last used tab",
  next: "Next tab",
};

const DOCUMENT_WIDTH_LABELS: Record<ReviewDocumentWidthChoice, string> = {
  standard: "Standard",
  wide: "Wide",
  full: "Full",
};

const READY_NOTIFICATION_LABELS: Record<ReviewReadyNotificationChoice, string> =
  {
    notificationAndBadge: "Notification and badge",
    notification: "Notification only",
    off: "Off",
  };

/**
 * The Settings page. It opens from the application menu (Preferences →
 * Settings...), the command palette, or ⌘,. Reuses the Home page shell so the
 * surfaces read as one app.
 *
 * The workbench owns every value here. Each setter resolves with the value that
 * landed, so a row shows the real state rather than an optimistic one.
 */
export function SettingsPage({
  settings,
}: {
  settings: ReviewCanvasSettingsContent;
}) {
  const [theme, setTheme] = useState(settings.theme);
  const [keymap, setKeymap] = useState(settings.keymap);
  const [ctrlTab, setCtrlTab] = useState(settings.ctrlTab);
  const [documentWidth, setDocumentWidth] = useState(settings.documentWidth);

  const [readyNotification, setReadyNotification] = useState(
    settings.readyNotification,
  );

  const [softwareMapEnabled, setSoftwareMapEnabled] = useState(
    settings.softwareMapEnabled,
  );

  const structuralDiffEnabled = settings.structuralDiffEnabled;

  const [scratchpadEnabled, setScratchpadEnabled] = useState(
    settings.scratchpadEnabled,
  );

  const [installStatus, setInstallStatus] = useState<
    ReviewCliInstallStatus | undefined
  >(settings.install?.status);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => setInstallStatus(settings.install?.status),
    [settings.install?.status],
  );

  const install =
    settings.install && installStatus
      ? { ...settings.install, status: installStatus }
      : settings.install;

  const run = async <T,>(
    key: string,
    action: () => Promise<T>,
    adopt: (value: T) => void,
  ) => {
    setBusy(key);
    setError(null);

    try {
      adopt(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main {...withClass("review-home", homeStyles.page)}>
      <div {...stylex.props(homeStyles.scroll)}>
        <div {...stylex.props(homeStyles.content, styles.page)}>
          <div {...stylex.props(homeStyles.header)}>
            <h1 {...stylex.props(homeStyles.heading)}>Settings</h1>
          </div>
          <p {...stylex.props(styles.lede)}>
            Settings apply to Blackboard on this machine.
          </p>

          {install ? (
            <Section label="Agents">
              <ConnectCard install={install} />
            </Section>
          ) : null}

          {install?.status.cli ? (
            <Section label="Command line">
              <Row
                label="blackboard command"
                description={
                  install.status.shim.installed
                    ? `Installed at ${install.status.shim.path}. Your agents run it.`
                    : "Adds blackboard to your shell PATH. Your agents run it."
                }
              >
                {install.status.shim.installer ? null : (
                  <Button
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "command",
                        () =>
                          install.status.shim.installed
                            ? install.remove({ shim: true })
                            : install.apply({ shim: true }),
                        setInstallStatus,
                      )
                    }
                  >
                    {install.status.shim.installed ? "Remove" : "Install"}
                  </Button>
                )}
              </Row>
            </Section>
          ) : null}

          <Section label="Editor">
            <Row label="Theme" description="How Blackboard looks.">
              <Choice
                label="Theme"
                value={theme}
                labels={THEME_LABELS}
                disabled={busy !== null}
                onChange={(choice) =>
                  void run("theme", () => settings.setTheme(choice), setTheme)
                }
              />
            </Row>
            <Row
              label="Document width"
              description="Wide and Full give diagrams and code more room. Text keeps a reading width."
            >
              <Choice
                label="Document width"
                value={documentWidth}
                labels={DOCUMENT_WIDTH_LABELS}
                disabled={busy !== null}
                onChange={(choice) =>
                  void run(
                    "document-width",
                    () => settings.setDocumentWidth(choice),
                    setDocumentWidth,
                  )
                }
              />
            </Row>
            <Row
              label="Keymap"
              description="Vim, Emacs, and Sublime Text keys come from a bundled extension. A change needs a reload."
            >
              <Choice
                label="Keymap"
                value={keymap}
                labels={KEYMAP_LABELS}
                disabled={busy !== null}
                onChange={(choice) => {
                  void run(
                    "keymap",
                    () => settings.setKeymap(choice),
                    setKeymap,
                  );
                }}
              />
            </Row>
            <Row
              label="Ctrl+Tab"
              description="Jump back to the last used tab, or step through the tab bar."
            >
              <Choice
                label="Ctrl+Tab"
                value={ctrlTab}
                labels={CTRL_TAB_LABELS}
                disabled={busy !== null}
                onChange={(choice) =>
                  void run(
                    "ctrl-tab",
                    () => settings.setCtrlTab(choice),
                    setCtrlTab,
                  )
                }
              />
            </Row>
          </Section>

          <Section label="Notifications">
            <Row
              label="Review ready"
              description="When an agent finishes a review you aren't looking at."
            >
              <Choice
                label="Review ready"
                value={readyNotification}
                labels={READY_NOTIFICATION_LABELS}
                disabled={busy !== null}
                onChange={(choice) =>
                  void run(
                    "ready-notification",
                    () => settings.setReadyNotification(choice),
                    setReadyNotification,
                  )
                }
              />
            </Row>
          </Section>

          <Section label="Tools">
            <Row
              label="Extensions"
              description="Install or turn on language extensions."
            >
              <Button onClick={settings.manageExtensions}>Manage…</Button>
            </Row>
          </Section>

          <Section label="Experimental Features">
            <Row
              label="Structural Diffs"
              description="Structural rendering is temporarily unavailable. Your preference is saved."
            >
              <div {...stylex.props(styles.toggle)}>
                <Switch
                  aria-label="Structural Diffs"
                  checked={structuralDiffEnabled}
                  disabled
                />
              </div>
            </Row>
            <Row
              label="Software Map"
              description="Show the experimental Software Map view in sessions."
            >
              <div {...stylex.props(styles.toggle)}>
                <Switch
                  aria-label="Software Map"
                  checked={softwareMapEnabled}
                  disabled={busy !== null}
                  onCheckedChange={(enabled) => {
                    void run(
                      "software-map",
                      () => settings.setSoftwareMapEnabled(enabled),
                      setSoftwareMapEnabled,
                    );
                  }}
                />
              </div>
            </Row>
            <Row
              label="Scratchpad"
              description="Show the experimental scratchpad on Home. Agents draw on it through Blackboard's MCP tools."
            >
              <div {...stylex.props(styles.toggle)}>
                <Switch
                  aria-label="Scratchpad"
                  checked={scratchpadEnabled}
                  disabled={busy !== null}
                  onCheckedChange={(enabled) => {
                    void run(
                      "scratchpad",
                      () => settings.setScratchpadEnabled(enabled),
                      setScratchpadEnabled,
                    );
                  }}
                />
              </div>
            </Row>
          </Section>

          {error ? <p {...stylex.props(styles.error)}>{error}</p> : null}
        </div>
      </div>
    </main>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section {...stylex.props(styles.section)} aria-label={label}>
      <h2 {...stylex.props(textStyles.eyebrow, styles.sectionLabel)}>
        {label}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.rowText)}>
        <span {...stylex.props(styles.rowLabel)}>{label}</span>
        <span {...stylex.props(styles.rowDescription)}>{description}</span>
      </div>
      <div {...stylex.props(styles.rowControl)}>{children}</div>
    </div>
  );
}
