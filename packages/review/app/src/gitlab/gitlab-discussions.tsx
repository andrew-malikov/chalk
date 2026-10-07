import { ReviewPanelFrame } from "@canvas/review/review-components";
import { fontSize, fontWeight, radius } from "@canvas/styles/scale.stylex";
import { tokens } from "@canvas/styles/tokens.stylex";
import { Button } from "@canvas/ui/button";
import type {
  GitLabDiscussion,
  GitLabDraft,
  GitLabTarget,
} from "@dev.fast/review-protocol";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

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

export function GitLabDiscussionContent() {
  const gitlab = useGitLab();

  if (!gitlab) return null;
  const { state, editors } = gitlab;

  const drafts = [
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
        <p role="status">Loading GitLab discussions…</p>
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

function Discussion({ discussion }: { discussion: GitLabDiscussion }) {
  const gitlab = useGitLab()!;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (gitlab.selected === discussion.id)
      ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [gitlab.selected, discussion.id]);

  return (
    <div
      ref={ref}
      {...stylex.props(
        styles.card,
        gitlab.selected === discussion.id && styles.selected,
      )}
    >
      {discussion.location ? (
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
      {discussion.comments.map((note) => (
        <div key={note.id}>
          <div {...stylex.props(styles.meta)}>
            @{note.author.username}
            {note.author.bot ? " · bot" : ""} ·{" "}
            <time dateTime={note.createdAt}>
              {new Date(note.createdAt).toLocaleDateString()}
            </time>
          </div>
          <p {...stylex.props(styles.body)}>{note.body}</p>
        </div>
      ))}
      <div {...stylex.props(styles.actions)}>
        <Button
          disabled={!gitlab.editable || gitlab.busy}
          onClick={() =>
            gitlab.compose({ kind: "reply", discussionId: discussion.id })
          }
        >
          Reply
        </Button>
        {discussion.resolvable && !discussion.resolved && (
          <Button
            disabled={!gitlab.editable || gitlab.busy}
            onClick={() =>
              void gitlab.run("resolve", { discussionId: discussion.id })
            }
          >
            Resolve
          </Button>
        )}
      </div>
    </div>
  );
}

function DraftEditor({ draft }: { draft: GitLabDraft }) {
  const gitlab = useGitLab()!;
  const editor = gitlab.editors[draft.id];
  const input = useRef<HTMLTextAreaElement>(null);
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

  return (
    <div {...stylex.props(styles.card)}>
      <label htmlFor={`gitlab-draft-${draft.id}`}>
        {targetLabel(editor?.target ?? draft.target)}
      </label>

      {thread && (
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
        id={`gitlab-draft-${draft.id}`}
        {...stylex.props(styles.editor)}
        value={editor?.text ?? draft.text}
        onChange={(event) => gitlab.edit(draft.id, event.target.value)}
        disabled={!gitlab.editable || gitlab.busy || locked}
        placeholder="Write your comment…"
      />
      <span {...stylex.props(styles.meta)} role="status">
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
      {(editor?.error || draft.error) && (
        <p role="alert">{editor?.error ?? draft.error}</p>
      )}
      {!locked ? (
        <div {...stylex.props(styles.actions)}>
          <Button
            variant="primary"
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
        </div>
      ) : (
        <div {...stylex.props(styles.recovery)}>
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

const styles = stylex.create({
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
  actions: { display: "flex", flexWrap: "wrap", gap: 8 },
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
  recovery: { display: "flex", flexDirection: "column", gap: 8 },
});
