import { Checkbox } from "@canvas/components/ui/checkbox";
import { Input } from "@canvas/components/ui/input";
import { MarkdownContent } from "@canvas/documents/agent-markdown";
import { cn } from "@canvas/lib/utils";
import { ReviewPanelFrame } from "@canvas/review/review-components";
import { loadingStyles } from "@canvas/styles/loading.stylex";
import { withClass } from "@canvas/styles/stylex-props";
import { Button } from "@canvas/ui/button";
import type {
  GitLabDiscussion,
  GitLabDraft,
  GitLabTarget,
} from "@chalk/review-contracts";
import { ChevronRightIcon, CornerDownRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { CommentEditor } from "./comment-editor";
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

  return (
    <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-4 tw:p-4 tw:font-[family-name:var(--chrome-font)] tw:text-[13px] tw:text-[var(--ink)]">
      {state ? (
        <div className="tw:flex tw:flex-col tw:gap-1.5 tw:text-[12px] tw:wrap-anywhere tw:text-[var(--ink-faint)]">
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
        <p role="status" {...withClass(undefined, loadingStyles.text)}>
          Loading GitLab discussions…
        </p>
      )}
      {!gitlab.editable && (
        <p>Open the current local review to draft or post comments.</p>
      )}
      {gitlab.error && <p role="alert">{gitlab.error}</p>}
      {state?.connectionError && <p role="alert">{state.connectionError}</p>}
      {state?.sourceError && <p role="alert">{state.sourceError}</p>}
      <div className={actions}>
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
      <h3 className={heading}>Open discussions · {open.length}</h3>
      {open.length === 0 && state && <p>No open discussions.</p>}
      {open.map((d) => (
        <Discussion key={d.id} discussion={d} />
      ))}
      <Collapsible
        summary={`Resolved · ${resolved.length}`}
        open={resolved.some((d) => d.id === gitlab.selected)}
      >
        {resolved.map((d) => (
          <Discussion key={d.id} discussion={d} />
        ))}
      </Collapsible>
      {unsent.length > 0 && (
        <>
          <h3 className={heading}>Local drafts · {unsent.length}</h3>
          {unsent.map((d) => (
            <DraftEditor key={d.id} draft={d} />
          ))}
        </>
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
    <div className="tw:flex tw:flex-col">
      {discussion && <Discussion discussion={discussion} inline />}
      {local.map((draft) => (
        <DraftEditor
          key={draft.id}
          draft={draft}
          inline
          attached={!!discussion}
        />
      ))}
    </div>
  );

  return (
    <section
      className="tw:m-0 tw:box-border tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-2 tw:whitespace-normal tw:bg-[var(--surface-raised)] tw:p-3 tw:font-[family-name:var(--chrome-font)] tw:text-[13px] tw:text-[var(--ink)]"
      aria-label={`GitLab ${annotation.kind} ${annotation.id}`}
    >
      {gitlab.error && <p role="alert">{gitlab.error}</p>}
      {discussion?.resolved ? (
        <Collapsible
          summary={`Resolved · @${discussion.comments[0]?.author.username}`}
          open={local.length > 0 || gitlab.selected === discussion.id}
        >
          {content}
        </Collapsible>
      ) : (
        content
      )}
    </section>
  );
}

function Collapsible({
  summary,
  open = false,
  children,
}: {
  summary: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="tw:group tw:max-w-[820px]"
      open={open ? true : undefined}
    >
      <summary className="tw:flex tw:cursor-pointer tw:list-none tw:items-center tw:gap-2 tw:px-1 tw:py-2 tw:text-[var(--ink-muted)] tw:hover:text-[var(--ink)] tw:[&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          className="tw:size-3.5 tw:shrink-0 tw:group-open:rotate-90"
          aria-hidden="true"
        />
        {summary}
      </summary>
      <div className="tw:flex tw:flex-col tw:gap-2">{children}</div>
    </details>
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
      className={cn(
        card,
        inlineCard,
        inline && "tw:relative tw:z-[1]",
        gitlab.selected === discussion.id && "tw:border-[var(--ink-faint)]",
      )}
    >
      {inline ? null : discussion.location ? (
        <Button
          variant="ghost"
          className="tw:h-auto tw:self-start tw:bg-transparent tw:px-0 tw:has-[>svg]:px-0 tw:text-[11px] tw:text-[color:var(--ink-faint)] tw:hover:text-[color:var(--ink)]"
          onClick={() => gitlab.select(discussion)}
        >
          {discussion.location.file}:{discussion.location.from}
          {discussion.location.to !== discussion.location.from
            ? `–${discussion.location.to}`
            : ""}{" "}
          · {discussion.location.side}
        </Button>
      ) : (
        <span className={meta}>
          {discussion.position
            ? "Unmapped code discussion"
            : "General discussion"}
        </span>
      )}
      {discussion.comments.map((note, index) => (
        <div
          key={note.id}
          className={cn(
            "tw:flex tw:min-w-0 tw:items-start tw:gap-3",
            index > 0 && "tw:ms-11",
          )}
        >
          <span
            className="tw:flex tw:size-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-[color-mix(in_srgb,var(--link)_12%,transparent)] tw:text-[11px] tw:font-semibold tw:text-[var(--link)]"
            aria-hidden="true"
          >
            {(note.author.name || note.author.username)
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
            <div className="tw:flex tw:flex-wrap tw:items-baseline tw:gap-2">
              <strong title={`@${note.author.username}`}>
                {note.author.id === gitlab.state?.account?.id
                  ? "You"
                  : note.author.name || note.author.username}
              </strong>
              {note.author.bot && <span className={meta}>bot</span>}
              <time
                className={meta}
                dateTime={note.createdAt}
                title={new Date(note.createdAt).toLocaleString()}
              >
                {relativeTime(note.createdAt)}
              </time>
            </div>
            <NoteBody source={note.body} />
          </div>
        </div>
      ))}
      <div className={cn(actions, "tw:ms-11 tw:items-center")}>
        <Button
          variant="ghost"
          className={textAction}
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
            className={textAction}
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
        <a
          className="tw:ms-auto tw:text-[11px] tw:text-[var(--ink-faint)] tw:no-underline tw:hover:underline"
          href={gitlab.state?.identity.url}
          target="_blank"
          rel="noreferrer"
        >
          View on GitLab
        </a>
      </div>
    </div>
  );
}

function DraftEditor({
  draft,
  inline = false,
  attached = false,
}: {
  draft: GitLabDraft;
  inline?: boolean;
  attached?: boolean;
}) {
  const gitlab = useGitLab()!;
  const editor = gitlab.editors[draft.id];
  const labelId = useId();
  const [verified, setVerified] = useState(false);
  const [noteId, setNoteId] = useState("");
  const locked = !["saved", "failed"].includes(draft.status);
  const target = editor?.target ?? draft.target;

  const canPost =
    gitlab.editable &&
    !gitlab.busy &&
    !!(editor?.text ?? draft.text).trim() &&
    !(draft.target.kind === "inline" && draft.target.unmapped);

  const thread =
    target.kind === "reply"
      ? gitlab.state?.discussions.find((d) => d.id === target.discussionId)
      : undefined;

  const saveStatus = (
    <span
      {...withClass(
        cn(meta, "tw:ms-auto"),
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
    <div
      className={cn(
        card,
        inline && inlineCard,
        attached &&
          "tw:-mt-2 tw:rounded-t-none tw:bg-[var(--surface-raised)] tw:pt-5",
      )}
    >
      <div className="tw:flex tw:flex-wrap tw:items-baseline tw:justify-between tw:gap-2 tw:wrap-anywhere">
        <span id={labelId}>{targetLabel(editor?.target ?? draft.target)}</span>
        {inline && (
          <span className={meta}>
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
      <CommentEditor
        value={editor?.text ?? draft.text}
        onChange={(text) => gitlab.edit(draft.id, text)}
        onSubmit={() => {
          if (canPost) void gitlab.run("post", { id: draft.id });
        }}
        disabled={!gitlab.editable || gitlab.busy || locked}
        focused={gitlab.selected === draft.id}
        placeholder="Write your comment…"
        labelledBy={labelId}
        inline={inline}
      />
      {(editor?.error || draft.error) && (
        <p role="alert">{editor?.error ?? draft.error}</p>
      )}
      {!locked ? (
        <div className={cn(actions, "tw:items-center")}>
          <Button
            variant="primary"
            loading={
              gitlab.pending?.action === "post" &&
              gitlab.pending.input.id === draft.id
            }
            disabled={!canPost}
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
        <div className="tw:flex tw:flex-col tw:gap-2">
          {saveStatus}
          <label>
            <Checkbox
              aria-label="I checked this MR on GitLab and verified the outcome"
              checked={verified}
              disabled={!gitlab.editable || gitlab.busy}
              onCheckedChange={(checked) => setVerified(checked === true)}
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
            <Input
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

/** GitLab Markdown, rendered as the editor's Preview renders it. */
function NoteBody({ source }: { source: string }) {
  return (
    <div className="tw:min-w-0 tw:leading-[1.6] tw:wrap-anywhere">
      <MarkdownContent source={source} />
    </div>
  );
}

const card =
  "tw:flex tw:min-w-0 tw:flex-col tw:gap-2.5 tw:rounded-[8px] tw:border tw:border-[var(--chrome-border)] tw:p-3";

const inlineCard = "tw:max-w-[820px] tw:gap-3 tw:bg-[var(--surface)]";

const actions = "tw:flex tw:flex-wrap tw:gap-2";

const heading = "tw:m-0 tw:text-[13px] tw:font-semibold";

const meta = "tw:text-[11px] tw:text-[var(--ink-faint)]";

const textAction =
  "tw:bg-transparent tw:px-0 tw:has-[>svg]:px-0 tw:text-[13px] tw:text-[color:var(--link)]";
