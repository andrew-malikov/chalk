import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@canvas/components/ui/alert-dialog";
import { Checkbox } from "@canvas/components/ui/checkbox";
import { Switch } from "@canvas/components/ui/switch";
import { Textarea } from "@canvas/components/ui/textarea";
import { cn } from "@canvas/lib/utils";
import { Button } from "@canvas/ui/button";
import { TextField, fieldStyles } from "@canvas/ui/text-field";
import {
  type JsonValue,
  type ReviewDiffrConfig,
  type ReviewDiffrConfigActions,
  type ReviewDiffrSummarizerInput,
  isJsonObject,
  isStringValue,
} from "@chalk/review-contracts";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Choice } from "./settings-choice";
import { settingsStyles as styles } from "./settings-styles";

const hideKey = "plugins.classify.bundled.hide";

const summarizeKey = "plugins.shape.bundled.summarize";

const displaySettings = [
  ["plugins.shape.bundled.context.enabled", "Collapse unchanged lines"],
  ["plugins.shape.bundled.test-bodies.enabled", "Collapse test bodies"],
  [
    "plugins.shape.bundled.deleted-bodies.enabled",
    "Collapse deleted function bodies",
  ],
  [
    "plugins.shape.bundled.removed-runs.enabled",
    "Collapse long removed stretches",
  ],
  [hideKey, "Hide files by tag"],
  ["plugins.classify.bundled.hide_deleted", "Hide deleted files"],
] as const;

function setting(
  config: ReviewDiffrConfig,
  key: string,
): JsonValue | undefined {
  let value: JsonValue | undefined = config.values;

  for (const part of key.split("."))
    value = isJsonObject(value) ? value[part] : undefined;

  return value;
}

function provider(config: ReviewDiffrConfig): string {
  return String(setting(config, `${summarizeKey}.provider`) ?? "");
}

/** The provider diffr describes as `id`, if any. */
function described(config: ReviewDiffrConfig, id: string) {
  return config.providers?.find((known) => known.id === id);
}

function title(config: ReviewDiffrConfig, id: string): string {
  return described(config, id)?.title ?? id;
}

function summaryDraft(config: ReviewDiffrConfig): ReviewDiffrSummarizerInput {
  return {
    enabled: setting(config, `${summarizeKey}.enabled`) === true,
    provider: provider(config),
    model: String(setting(config, `${summarizeKey}.model`) ?? ""),
    endpoint: String(setting(config, `${summarizeKey}.endpoint`) ?? ""),
    systemPrompt: String(
      setting(config, `${summarizeKey}.system_prompt`) ??
        config.defaultPrompt ??
        "",
    ),
    tests: setting(config, `${summarizeKey}.tests`) === true,
    apiKey: "",
  };
}

export function DiffrConfigSection({
  actions,
  reloadWindow,
}: {
  actions: ReviewDiffrConfigActions;
  reloadWindow(): Promise<void>;
}) {
  const [opened, setOpened] = useState(false);
  const [config, setConfig] = useState<ReviewDiffrConfig>();
  const [draft, setDraft] = useState<ReviewDiffrSummarizerInput>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const rememberedTags = useRef<string[] | undefined>(undefined);
  const [error, setError] = useState<string>();
  const [summary, setSummary] = useState<string>();
  const [changed, setChanged] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    actions.read().then(
      (result) => {
        if (cancelled) return;
        rememberTags(result);
        setConfig(result);
        setDraft(summaryDraft(result));
      },
      () => {
        if (!cancelled)
          setError(
            "Could not read diffr settings. Reopen Settings to try again.",
          );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [actions, opened]);

  async function run(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);

    try {
      await operation();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update diffr settings.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  // Unchecking empties the tag list, so keep the last one to restore.
  function rememberTags(result: ReviewDiffrConfig) {
    const tags = setting(result, hideKey);

    if (Array.isArray(tags) && tags.length)
      rememberedTags.current = tags.filter(isStringValue);
  }

  function saved(result: ReviewDiffrConfig) {
    rememberTags(result);
    setConfig(result);

    if (result.changed) setChanged(true);
    setError(result.error);
  }

  const dirty =
    config &&
    draft &&
    JSON.stringify(draft) !== JSON.stringify(summaryDraft(config));

  const unavailable =
    !config || setting(config, `${summarizeKey}.enabled`) === undefined;

  const summaryValid = !!draft?.model.trim();
  const savedDraft = config && summaryDraft(config);
  const hiddenTags = config && setting(config, hideKey);

  return (
    <div className={styles.diffr}>
      <details>
        <summary
          className={styles.diffrSummary}
          onClick={() => setOpened(true)}
        >
          Diff display and AI summaries
        </summary>
        {opened && (
          <>
            <p className={styles.rowDescription}>
              Shared with the diffr CLI. Applies to all repositories.
            </p>
            {!config && !error && <p role="status">Reading diffr settings…</p>}
            {config && (
              <>
                <h3>Display</h3>
                {displaySettings.map(([key, label]) => (
                  <div key={key}>
                    <SettingRow label={label}>
                      <Switch
                        aria-label={label}
                        checked={
                          key === hideKey
                            ? Array.isArray(hiddenTags) && hiddenTags.length > 0
                            : setting(config, key) === true
                        }
                        disabled={busy || setting(config, key) === undefined}
                        onCheckedChange={(checked) => {
                          const value =
                            key === hideKey
                              ? checked
                                ? (rememberedTags.current ??
                                  config.defaultHiddenTags ??
                                  [])
                                : []
                              : checked;

                          void run(async () =>
                            saved(await actions.set(key, value)),
                          );
                        }}
                      />
                    </SettingRow>
                    {setting(config, key) === undefined && (
                      <p className={styles.unavailable}>
                        Not available in this configuration.
                      </p>
                    )}
                    {key === "plugins.shape.bundled.context.enabled" && (
                      <SettingRow label="Context lines">
                        <ContextLines
                          value={setting(
                            config,
                            "plugins.shape.bundled.context.lines",
                          )}
                          disabled={busy || setting(config, key) !== true}
                          commit={(value) =>
                            void run(async () =>
                              saved(
                                await actions.set(
                                  "plugins.shape.bundled.context.lines",
                                  value,
                                ),
                              ),
                            )
                          }
                        />
                      </SettingRow>
                    )}
                    {key === hideKey && Array.isArray(hiddenTags) && (
                      <p className={styles.rowDescription}>
                        Tags: {hiddenTags.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
                <h3>AI summaries</h3>
                <p className={styles.rowDescription}>
                  Sends source-file contents to the selected provider to
                  summarize large new functions and tests.
                </p>
                {unavailable && (
                  <p className={styles.unavailable}>
                    The summarizer is not available in this configuration.
                  </p>
                )}
                {draft && (
                  <fieldset
                    disabled={busy || unavailable}
                    className={styles.summaryFields}
                  >
                    <SettingRow label="Enable summaries">
                      <Switch
                        aria-label="Enable summaries"
                        disabled={busy || unavailable}
                        checked={draft.enabled}
                        onCheckedChange={(enabled) =>
                          setDraft({ ...draft, enabled })
                        }
                      />
                    </SettingRow>
                    {!!config.providers?.length && (
                      <SettingRow label="Provider">
                        <Choice
                          label="Provider"
                          value={draft.provider}
                          labels={Object.fromEntries(
                            config.providers.map((known) => [
                              known.id,
                              known.title,
                            ]),
                          )}
                          disabled={busy || unavailable}
                          onChange={(choice) =>
                            setDraft({
                              ...draft,
                              provider: choice,
                              model: described(config, choice)?.model ?? "",
                              endpoint: "",
                              apiKey: "",
                            })
                          }
                        />
                      </SettingRow>
                    )}
                    <SettingRow label="API key">
                      <TextField
                        className={styles.input}
                        aria-label="API key"
                        type="password"
                        autoComplete="off"
                        placeholder="Enter replacement key"
                        value={draft.apiKey}
                        onChange={(event) =>
                          setDraft({ ...draft, apiKey: event.target.value })
                        }
                      />
                    </SettingRow>
                    <p className={styles.rowDescription}>
                      {draft.provider !== provider(config) ||
                      draft.endpoint !== savedDraft?.endpoint
                        ? config.credentialSource !== "config"
                          ? `Enter a key for ${title(config, draft.provider)}, or leave blank to use its environment variable.`
                          : draft.provider !== provider(config)
                            ? `Saving clears the key saved for ${title(config, provider(config))}.`
                            : "Saving clears the saved key, since the endpoint changed."
                        : `${
                            config.credentialSource === "config"
                              ? "Saved key"
                              : config.credentialSource === "environment"
                                ? "Environment key available"
                                : "Not configured"
                          }. Replacement keys are stored in diffr’s config. Leave blank to keep the current key.`}
                    </p>
                    <SettingRow label="Model">
                      <TextField
                        className={styles.input}
                        aria-label="Model"
                        value={draft.model}
                        onChange={(event) =>
                          setDraft({ ...draft, model: event.target.value })
                        }
                      />
                    </SettingRow>
                    <SettingRow label="Endpoint URL">
                      <TextField
                        className={styles.input}
                        aria-label="Endpoint URL"
                        placeholder={
                          described(config, draft.provider)?.endpoint
                        }
                        value={draft.endpoint}
                        onChange={(event) =>
                          setDraft({ ...draft, endpoint: event.target.value })
                        }
                      />
                    </SettingRow>
                    <p className={styles.rowDescription}>
                      Optional. With OpenAI, point this at any compatible
                      server, such as OpenRouter or Ollama.
                    </p>
                    <label className={styles.prompt}>
                      <span className={styles.rowLabel}>
                        Prompt{" "}
                        <span className={styles.rowDescription}>
                          {draft.systemPrompt === config.defaultPrompt
                            ? "Default"
                            : "Customized"}
                        </span>
                      </span>
                      <Textarea
                        className={cn(fieldStyles.box, fieldStyles.multiline)}
                        aria-label="Prompt"
                        rows={6}
                        value={draft.systemPrompt}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            systemPrompt: event.target.value,
                          })
                        }
                      />
                    </label>
                    <p className={styles.rowDescription}>
                      Sent with every request. diffr adds the file and the folds
                      to summarize, and asks for structured output where the
                      provider supports it.{" "}
                      {config.defaultPrompt &&
                        draft.systemPrompt !== config.defaultPrompt && (
                          <Button
                            onClick={() =>
                              setDraft({
                                ...draft,
                                systemPrompt: config.defaultPrompt ?? "",
                              })
                            }
                          >
                            Reset to default
                          </Button>
                        )}
                    </p>
                    <SettingRow label="Include tests">
                      <Checkbox
                        aria-label="Include tests"
                        disabled={busy || unavailable}
                        checked={draft.tests}
                        onCheckedChange={(checked) =>
                          setDraft({ ...draft, tests: checked === true })
                        }
                      />
                    </SettingRow>
                    <div className={styles.summaryActions}>
                      <Button
                        disabled={!summaryValid}
                        onClick={() =>
                          void run(async () => {
                            setSummary(undefined);
                            setSummary(await actions.testSummarizer(draft));
                          })
                        }
                      >
                        Test setup
                      </Button>
                      <Button
                        disabled={!summaryValid || !dirty}
                        onClick={() =>
                          void run(async () => {
                            const result = await actions.saveSummarizer(draft);
                            saved(result);

                            if (!result.error || result.changed)
                              setDraft(summaryDraft(result));
                          })
                        }
                      >
                        Save summaries
                      </Button>
                    </div>
                    <p className={styles.rowDescription}>
                      Test setup sends synthetic code without saving your
                      settings.
                    </p>
                  </fieldset>
                )}
                {summary && (
                  <pre
                    className={styles.summaryResult}
                    aria-label="Sample summary"
                  >
                    {summary}
                  </pre>
                )}
              </>
            )}
          </>
        )}
      </details>
      {busy && <p role="status">Working…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {changed && (
        <p role="status">
          Reload the window to see changes.{" "}
          <Button
            disabled={busy}
            onClick={() => {
              if (dirty) setConfirmReload(true);
              else void run(reloadWindow);
            }}
          >
            Reload window
          </Button>
        </p>
      )}
      <AlertDialog open={confirmReload} onOpenChange={setConfirmReload}>
        <AlertDialogContent>
          <AlertDialogTitle>Discard summary changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Discard unsaved summary settings and reload?
          </AlertDialogDescription>
          <div className="tw:flex tw:justify-end tw:gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void run(reloadWindow)}
            >
              Discard and reload
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      {children}
    </div>
  );
}

function ContextLines({
  value,
  disabled,
  commit,
}: {
  value: JsonValue | undefined;
  disabled: boolean;
  commit(value: number): void;
}) {
  const [text, setText] = useState(String(value ?? ""));
  const [error, setError] = useState(false);
  useEffect(() => {
    setText(String(value ?? ""));
  }, [value]);

  function save() {
    if (text === String(value ?? "")) return;
    const number = Number(text);

    if (
      !text.trim() ||
      !Number.isInteger(number) ||
      number < 0 ||
      number > 0xffff_ffff
    ) {
      setError(true);

      return;
    }

    setError(false);
    commit(number);
  }

  return (
    <div>
      <TextField
        className={styles.input}
        aria-label="Context lines"
        type="number"
        min={0}
        max={0xffff_ffff}
        step={1}
        value={text}
        disabled={disabled || value === undefined}
        aria-invalid={error}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
        }}
      />
      {error && <p role="alert">Enter a nonnegative whole number.</p>}
    </div>
  );
}
