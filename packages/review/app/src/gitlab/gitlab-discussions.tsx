import { ReviewPanelFrame } from "@canvas/review/review-components";
import { loadingStyles } from "@canvas/styles/loading.stylex";
import { resolvedDiscussionMarker } from "@canvas/styles/markers.stylex";
import { fontSize, fontWeight, radius } from "@canvas/styles/scale.stylex";
import { tokens } from "@canvas/styles/tokens.stylex";
import { Button } from "@canvas/ui/button";
import type {
  GitLabDiscussion,
  GitLabDraft,
  GitLabTarget,
} from "@dev.fast/review-protocol";
import * as stylex from "@stylexjs/stylex";
import { ChevronRightIcon, CornerDownRightIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useGitLab } from "./gitlab-context";

export function GitLabDiscussionPanel() {
  const gitlab = useGitLab();

  if (!gitlab) return null;

  return (
    <ReviewPanelFrame
      label="GitLab"
      title="Discussions"
      onClose={gitlab.toggle}
      closeLabel="Close GitLab discussions"
      headerActions={
        <Button
          loading={gitlab.pending?.action === "refresh"}
          disabled={!gitlab.editable || gitlab.busy}
          onClick={() => void gitlab.run("refresh")}
        >
          Refresh
        </Button>
      }
    >
      <GitLabDiscussionContent />
    </ReviewPanelFrame>
  );
}

export function useGitLabDrafts(): GitLabDraft[] {
  const gitlab = useGitLab();

  if (!gitlab) return [];
  const { state, editors } = gitlab;

  return [
    ...(state?.drafts ?? []),
    ...Object.entries(editors)
      .filter(([id]) => !state?.drafts.some((d) => d.id === id))
      .map(
        ([id, editor]): GitLabDraft => ({
          id,
          text: editor.text,
          target: editor.target,
          status: "saved",
          version: 0,
        }),
      ),
  ];
}

export function GitLabDiscussionContent() {
  const gitlab = useGitLab();
  const drafts = useGitLabDrafts();

  if (!gitlab) return null;
  const { state } = gitlab;

  const open = state?.discussions.filter((d) => !d.resolved) ?? [];
  const resolved = state?.discussions.filter((d) => d.resolved) ?? [];
  const unsent = drafts.filter((d) => d.status !== "sent");
  const sent = drafts.filter((d) => d.status === "sent");

  return (
    <div {...stylex.props(styles.content)}>
      {state ? (
        <div {...stylex.props(styles.identity)}>
          <a href={state.identity.url} target="_blank" rel="noreferrer">
            {state.identity.projectPath} !{state.identity.iid}
          </a>
          <span>
            {state.identity.host} ·{" "}
            {state.account
              ? `Posting as @${state.account.username}`
              : "Posting account unavailable"}
          </span>
        </div>
      ) : (
        <p role="status" {...stylex.props(loadingStyles.text)}>
          Loading GitLab discussions…
        </p>
      )}
      {!gitlab.editable && (
        <p>Open the current local review to draft or post comments.</p>
      )}
      {gitlab.error && <p role="alert">{gitlab.error}</p>}
      {state?.connectionError && <p role="alert">{state.connectionError}</p>}
      {state?.sourceError && <p role="alert">{state.sourceError}</p>}
      <div {...stylex.props(styles.actions)}>
        <Button
          disabled={!gitlab.editable || gitlab.busy || !state}
          onClick={() => gitlab.compose({ kind: "general" })}
        >
          New comment
        </Button>
        <Button
          loading={
            gitlab.pending?.action === "post" && !gitlab.pending.input.id
          }
          disabled={
            !gitlab.editable ||
            gitlab.busy ||
            !unsent.some((d) => ["saved", "failed"].includes(d.status))
          }
          onClick={() => void gitlab.run("post")}
        >
          Post all
        </Button>
      </div>
      <h3 {...stylex.props(styles.heading)}>
        Open discussions · {open.length}
      </h3>
      {open.length === 0 && state && <p>No open discussions.</p>}
      {open.map((d) => (
        <Discussion key={d.id} discussion={d} />
      ))}
      <details
        open={resolved.some((d) => d.id === gitlab.selected) ? true : undefined}
      >
        <summary>Resolved · {resolved.length}</summary>
        {resolved.map((d) => (
          <Discussion key={d.id} discussion={d} />
        ))}
      </details>
      <h3 {...stylex.props(styles.heading)}>Local drafts · {unsent.length}</h3>
      {unsent.map((d) => (
        <DraftEditor key={d.id} draft={d} />
      ))}
      {sent.length > 0 && (
        <details>
          <summary>Sent · {sent.length}</summary>
          {sent.map((d) => (
            <div key={d.id} {...stylex.props(styles.card)}>
              <strong>Sent · #{d.noteId}</strong>
              <p {...stylex.props(styles.body)}>{d.text}</p>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function targetLabel(target: GitLabTarget) {
  if (target.kind === "general") return "General comment";

  if (target.kind === "reply") return "Reply to discussion";
  const p = target.position;

  return `${p.side === "head" ? p.newPath : p.oldPath}:${p.from}${p.to !== p.from ? `–${p.to}` : ""} · ${p.side}`;
}

export type GitLabInlineAnnotation =
  | { kind: "discussion"; id: string }
  | { kind: "draft"; id: string };

export function GitLabInlineContent({
  annotation,
}: {
  annotation: GitLabInlineAnnotation;
}) {
  const gitlab = useGitLab();
  const drafts = useGitLabDrafts();

  if (!gitlab) return null;

  const discussion =
    annotation.kind === "discussion"
      ? gitlab.state?.discussions.find((d) => d.id === annotation.id)
      : undefined;

  const local = drafts.filter(
    (d) =>
      d.status !== "sent" &&
      (annotation.kind === "draft"
        ? d.id === annotation.id
        : d.target.kind === "reply" && d.target.discussionId === annotation.id),
  );

  if (!discussion && local.length === 0) return null;

  const content = (
    <>
      {discussion && <Discussion discussion={discussion} inline />}
      {local.map((draft) => (
        <DraftEditor key={draft.id} draft={draft} inline />
      ))}
    </>
  );

  return (
    <section
      {...stylex.props(styles.inline)}
      aria-label={`GitLab ${annotation.kind} ${annotation.id}`}
    >
      {gitlab.error && <p role="alert">{gitlab.error}</p>}
      {discussion?.resolved ? (
        <details
          {...stylex.props(styles.resolvedDetails, resolvedDiscussionMarker)}
          open={
            local.length > 0 || gitlab.selected === discussion.id
              ? true
              : undefined
          }
        >
          <summary {...stylex.props(styles.resolvedSummary)}>
            <ChevronRightIcon
              {...stylex.props(styles.resolvedChevron)}
              aria-hidden="true"
            />
            Resolved · @{discussion.comments[0]?.author.username}
          </summary>
          {content}
        </details>
      ) : (
        content
      )}
    </section>
  );
}

function Discussion({
  discussion,
  inline = false,
}: {
  discussion: GitLabDiscussion;
  inline?: boolean;
}) {
  const gitlab = useGitLab()!;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!inline && gitlab.selected === discussion.id)
      ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [gitlab.selected, discussion.id, inline]);

  return (
    <div
      ref={ref}
      {...stylex.props(
        styles.card,
        inline && styles.inlineCard,
        gitlab.selected === discussion.id && styles.selected,
      )}
    >
      {inline ? null : discussion.location ? (
        <Button variant="ghost" onClick={() => gitlab.select(discussion)}>
          {discussion.location.file}:{discussion.location.from}
          {discussion.location.to !== discussion.location.from
            ? `–${discussion.location.to}`
            : ""}{" "}
          · {discussion.location.side}
        </Button>
      ) : (
        <span>
          {discussion.position
            ? "Unmapped code discussion"
            : "General discussion"}
        </span>
      )}
      {discussion.comments.map((note, index) => (
        <div
          key={note.id}
          {...stylex.props(styles.comment, index > 0 && styles.reply)}
        >
          <span {...stylex.props(styles.avatar)} aria-hidden="true">
            {(note.author.name || note.author.username)
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div {...stylex.props(styles.commentContent)}>
            <div {...stylex.props(styles.byline)}>
              <strong title={`@${note.author.username}`}>
                {note.author.id === gitlab.state?.account?.id
                  ? "You"
                  : note.author.name || note.author.username}
              </strong>
              {note.author.bot && (
                <span {...stylex.props(styles.meta)}>bot</span>
              )}
              <time
                {...stylex.props(styles.meta)}
                dateTime={note.createdAt}
                title={new Date(note.createdAt).toLocaleString()}
              >
                {relativeTime(note.createdAt)}
              </time>
            </div>
            <p {...stylex.props(styles.body)}>{note.body}</p>
          </div>
        </div>
      ))}
      <div {...stylex.props(styles.actions, styles.threadActions)}>
        <Button
          variant="ghost"
          xstyle={styles.textAction}
          disabled={!gitlab.editable || gitlab.busy}
          onClick={() =>
            gitlab.compose(
              { kind: "reply", discussionId: discussion.id },
              inline ? "inline" : "panel",
            )
          }
        >
          <CornerDownRightIcon aria-hidden="true" />
          Reply
        </Button>
        {discussion.resolvable && !discussion.resolved && (
          <Button
            variant="ghost"
            xstyle={styles.textAction}
            loading={
              gitlab.pending?.action === "resolve" &&
              gitlab.pending.input.discussionId === discussion.id
            }
            disabled={!gitlab.editable || gitlab.busy}
            onClick={() =>
              void gitlab.run("resolve", { discussionId: discussion.id })
            }
          >
            Resolve
          </Button>
        )}
        {inline && (
          <a
            {...stylex.props(styles.sourceLink)}
            href={gitlab.state?.identity.url}
            target="_blank"
            rel="noreferrer"
          >
            View on GitLab
          </a>
        )}
      </div>
    </div>
  );
}

function DraftEditor({
  draft,
  inline = false,
}: {
  draft: GitLabDraft;
  inline?: boolean;
}) {
  const gitlab = useGitLab()!;
  const editor = gitlab.editors[draft.id];
  const input = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const [verified, setVerified] = useState(false);
  const [noteId, setNoteId] = useState("");
  useEffect(() => {
    if (gitlab.selected === draft.id) input.current?.focus();
  }, [gitlab.selected, draft.id]);
  const locked = !["saved", "failed"].includes(draft.status);
  const target = editor?.target ?? draft.target;

  const thread =
    target.kind === "reply"
      ? gitlab.state?.discussions.find((d) => d.id === target.discussionId)
      : undefined;

  const saveStatus = (
    <span
      {...stylex.props(
        styles.meta,
        styles.saveStatus,
        editor?.dirty && !editor.error && loadingStyles.text,
      )}
      role="status"
    >
      {editor?.error
        ? "Unsaved"
        : editor?.dirty
          ? "Saving…"
          : draft.status === "sending"
            ? "Post interrupted or in progress; verify on GitLab"
            : draft.status === "uncertain"
              ? "Unconfirmed post"
              : draft.status === "failed"
                ? "Post failed"
                : "Saved locally"}
    </span>
  );

  return (
    <div {...stylex.props(styles.card, inline && styles.inlineCard)}>
      <div {...stylex.props(styles.draftHeader)}>
        <label htmlFor={inputId}>
          {targetLabel(editor?.target ?? draft.target)}
        </label>
        {inline && (
          <span {...stylex.props(styles.meta)}>
            {gitlab.state?.account
              ? `Posting as @${gitlab.state.account.username}`
              : "Posting account unavailable"}{" "}
            · {gitlab.state?.identity.host}
          </span>
        )}
      </div>

      {thread && !inline && (
        <Button variant="ghost" onClick={() => gitlab.select(thread)}>
          {thread.location
            ? `${thread.location.file}:${thread.location.from}`
            : `@${thread.comments[0]?.author.username} · ${thread.comments[0]?.body.slice(0, 80)}`}
        </Button>
      )}
      {draft.target.kind === "inline" && draft.target.unmapped && (
        <p role="status">
          Code could not be mapped. Your text is preserved. Select the current
          code to write a replacement comment.
        </p>
      )}
      <textarea
        ref={input}
        id={inputId}
        {...stylex.props(styles.editor, inline && styles.inlineEditor)}
        value={editor?.text ?? draft.text}
        onChange={(event) => gitlab.edit(draft.id, event.target.value)}
        disabled={!gitlab.editable || gitlab.busy || locked}
        placeholder="Write your comment…"
      />
      {(editor?.error || draft.error) && (
        <p role="alert">{editor?.error ?? draft.error}</p>
      )}
      {!locked ? (
        <div {...stylex.props(styles.actions, styles.draftActions)}>
          <Button
            variant="primary"
            loading={
              gitlab.pending?.action === "post" &&
              gitlab.pending.input.id === draft.id
            }
            disabled={
              !gitlab.editable ||
              gitlab.busy ||
              !(editor?.text ?? draft.text).trim() ||
              (draft.target.kind === "inline" && draft.target.unmapped)
            }
            onClick={() => void gitlab.run("post", { id: draft.id })}
          >
            Post
          </Button>
          <Button
            loading={
              gitlab.pending?.action === "discard" &&
              gitlab.pending.input.id === draft.id
            }
            disabled={!gitlab.editable || gitlab.busy}
            onClick={() => void gitlab.run("discard", { id: draft.id })}
          >
            Discard
          </Button>
          {editor?.error && (
            <Button
              disabled={gitlab.busy}
              onClick={() => gitlab.edit(draft.id, editor.text)}
            >
              Retry save
            </Button>
          )}
          {saveStatus}
        </div>
      ) : (
        <div {...stylex.props(styles.recovery)}>
          {saveStatus}
          <label>
            <input
              type="checkbox"
              checked={verified}
              disabled={!gitlab.editable || gitlab.busy}
              onChange={(e) => setVerified(e.target.checked)}
            />{" "}
            I checked this MR on GitLab and verified the outcome
          </label>
          <Button
            loading={
              gitlab.pending?.action === "recover" &&
              gitlab.pending.input.id === draft.id &&
              gitlab.pending.input.posted === false
            }
            disabled={!verified || !gitlab.editable || gitlab.busy}
            onClick={() =>
              void gitlab.run("recover", {
                id: draft.id,
                verified: true,
                posted: false,
              })
            }
          >
            Not posted · allow retry
          </Button>
          <label>
            Posted note ID{" "}
            <input
              type="number"
              min="1"
              value={noteId}
              onChange={(e) => setNoteId(e.target.value)}
            />
          </label>
          <Button
            loading={
              gitlab.pending?.action === "recover" &&
              gitlab.pending.input.id === draft.id &&
              gitlab.pending.input.posted === true
            }
            disabled={
              !verified ||
              !Number.isSafeInteger(Number(noteId)) ||
              Number(noteId) < 1 ||
              !gitlab.editable ||
              gitlab.busy
            }
            onClick={() =>
              void gitlab.run("recover", {
                id: draft.id,
                verified: true,
                posted: true,
                noteId: Number(noteId),
              })
            }
          >
            Mark as sent
          </Button>
        </div>
      )}
    </div>
  );
}

function relativeTime(date: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 60_000),
  );

  if (minutes < 1) return "now";

  if (minutes < 60) return `${minutes}m`;

  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;

  return new Date(date).toLocaleDateString();
}

const styles = stylex.create({
  inline: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    margin: 0,
    color: tokens.ink,
    backgroundColor: tokens.surfaceRaised,
    fontFamily: tokens.chromeFont,
    fontSize: fontSize.ui,
    whiteSpace: "normal",
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 16,
    color: tokens.ink,
    fontFamily: tokens.chromeFont,
    fontSize: fontSize.ui,
    minWidth: 0,
  },
  identity: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    overflowWrap: "anywhere",
    fontSize: fontSize.body,
    color: tokens.inkFaint,
  },
  heading: {
    fontSize: fontSize.ui,
    fontWeight: fontWeight.semibold,
    margin: 0,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: tokens.chromeBorder,
    borderRadius: radius.surface,
    minWidth: 0,
  },
  selected: { borderColor: tokens.inkFaint },
  inlineCard: {
    backgroundColor: tokens.surface,
    maxWidth: 820,
    gap: 12,
  },
  resolvedDetails: { maxWidth: 820 },
  resolvedSummary: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingBlock: 8,
    paddingInline: 4,
    listStyle: "none",
    color: { default: tokens.inkMuted, ":hover": tokens.ink },
    cursor: "pointer",
    "::marker": { content: "''" },
    "::-webkit-details-marker": { display: "none" },
  },
  resolvedChevron: {
    width: 14,
    height: 14,
    flexShrink: 0,
    transform: {
      default: "rotate(0deg)",
      [stylex.when.ancestor("[open]", resolvedDiscussionMarker)]:
        "rotate(90deg)",
    },
  },
  draftHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    overflowWrap: "anywhere",
  },
  comment: { display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 },
  reply: { marginInlineStart: 44 },
  avatar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: radius.round,
    backgroundColor: `color-mix(in srgb, ${tokens.link} 12%, transparent)`,
    color: tokens.link,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },
  commentContent: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    flex: 1,
  },
  byline: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  threadActions: { marginInlineStart: 44, alignItems: "center" },
  textAction: {
    color: tokens.link,
    paddingInline: 0,
    backgroundColor: "transparent",
    fontSize: fontSize.ui,
  },
  sourceLink: {
    color: tokens.inkFaint,
    fontSize: fontSize.small,
    marginInlineStart: "auto",
    textDecorationLine: { default: "none", ":hover": "underline" },
  },
  actions: { display: "flex", flexWrap: "wrap", gap: 8 },
  draftActions: { alignItems: "center" },
  saveStatus: { marginInlineStart: "auto" },
  body: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    margin: 0,
    lineHeight: 1.6,
  },
  meta: { fontSize: fontSize.small, color: tokens.inkFaint },
  editor: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 90,
    resize: "vertical",
    backgroundColor: tokens.bg,
    color: tokens.ink,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: tokens.chromeBorder,
    borderRadius: radius.small,
    padding: 8,
    fontFamily: tokens.chromeFont,
    fontSize: fontSize.ui,
    outlineOffset: 2,
  },
  inlineEditor: { minHeight: 72 },
  recovery: { display: "flex", flexDirection: "column", gap: 8 },
});
