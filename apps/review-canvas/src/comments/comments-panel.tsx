import { Checkbox } from "@canvas/components/ui/checkbox";
import { Input } from "@canvas/components/ui/input";
import { MarkdownContent } from "@canvas/documents/agent-markdown";
import { cn } from "@canvas/lib/utils";
import { ReviewPanelFrame } from "@canvas/review/review-components";
import { loadingStyles } from "@canvas/styles/loading";
import { Button, IconButton } from "@canvas/ui/button";
import { Chip } from "@canvas/ui/chip";
import { RefreshIcon } from "@canvas/ui/icons";
import type {
  CommentTarget,
  GitLabDiscussion,
  ReviewComment,
} from "@chalk/review-contracts";
import {
  CheckIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  CornerDownRightIcon,
  MessageSquareIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { CommentEditor } from "./comment-editor";
import { useComments } from "./comments-context";

export function CommentsPanel() {
  const comments = useComments();
  const drafts = useCommentDrafts();

  if (!comments) return null;
  const refreshing = comments.pending?.action === "refresh";

  return (
    <ReviewPanelFrame
      title="Comments"
      onClose={comments.toggle}
      closeLabel="Close comments"
      headerActions={
        <>
          <Button
            disabled={!comments.editable || comments.busy || !comments.state}
            onClick={() => comments.compose({ kind: "general" })}
          >
            New comment
          </Button>
          {comments.state?.gitlab && (
            <Button
              loading={
                comments.pending?.action === "post" &&
                !comments.pending.input.id
              }
              disabled={
                !comments.editable ||
                comments.busy ||
                !drafts.some((d) => ["saved", "failed"].includes(d.status))
              }
              onClick={() => comments.run("post")}
            >
              Post all
            </Button>
          )}
          {comments.state?.gitlab && (
            <IconButton
              size="large"
              aria-label="Refresh"
              title="Refresh"
              aria-busy={refreshing || undefined}
              className={
                refreshing
                  ? "tw:[&_svg]:animate-spin tw:motion-reduce:[&_svg]:animate-none"
                  : undefined
              }
              disabled={!comments.editable || comments.busy}
              onClick={() => comments.run("refresh")}
            >
              <RefreshIcon />
            </IconButton>
          )}
        </>
      }
    >
      <CommentsContent />
    </ReviewPanelFrame>
  );
}

export function useCommentDrafts(): ReviewComment[] {
  const comments = useComments();

  if (!comments) return [];
  const { state, editors } = comments;

  return [
    ...(state?.comments ?? []),
    ...Object.entries(editors)
      .filter(([id]) => !state?.comments.some((d) => d.id === id))
      .map(([id, editor]): ReviewComment => ({
        id,
        text: editor.text,
        target: editor.target,
        author: "user",
        status: "saved",
        version: 0,
        createdAt: editor.createdAt,
      })),
  ];
}

export function CommentsContent() {
  const comments = useComments();
  const drafts = useCommentDrafts();

  if (!comments) return null;
  const gitlab = comments.state?.gitlab;

  const unsent = drafts.filter((d) => d.status !== "sent");

  const threads = (gitlab?.discussions ?? []).map((discussion) => {
    const replies = unsent.filter(
      (d) =>
        d.target.kind === "reply" && d.target.discussionId === discussion.id,
    );

    return {
      kind: "discussion" as const,
      id: discussion.id,
      discussion,
      replies,
      time: Math.max(
        0,
        ...discussion.comments.map((c) => Date.parse(c.createdAt) || 0),
        ...replies.map((d) => Date.parse(d.createdAt ?? "") || 0),
      ),
    };
  });

  const resolved = threads
    .filter((t) => t.discussion.resolved)
    .sort((a, b) => b.time - a.time);

  // shortcut: untimed legacy drafts follow dated entries in reverse stored order; remove when legacy drafts are gone.
  const open = [
    ...threads.filter((t) => !t.discussion.resolved),
    ...unsent
      .toReversed()
      .filter((d) => !threads.some((t) => t.replies.includes(d)))
      .map((draft) => ({
        kind: "draft" as const,
        id: draft.id,
        draft,
        time: Date.parse(draft.createdAt ?? "") || 0,
      })),
  ].sort((a, b) => b.time - a.time);

  const renderThread = (thread: (typeof threads)[number]) => (
    <div
      key={thread.id}
      className="tw:flex tw:min-w-0 tw:max-w-[820px] tw:flex-col"
    >
      <Discussion
        discussion={thread.discussion}
        collapsible={thread.replies.length === 0}
      />
      {thread.replies.map((draft) => (
        <DraftEditor key={draft.id} draft={draft} attached />
      ))}
    </div>
  );

  return (
    <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-4 tw:p-4 tw:font-[family-name:var(--chrome-font)] tw:text-[13px] tw:text-[var(--ink)]">
      {!comments.state && (
        <p role="status" className={cn(undefined, loadingStyles.text)}>
          Loading comments…
        </p>
      )}
      {gitlab && (
        <div className="tw:flex tw:flex-col tw:gap-1.5 tw:text-[12px] tw:wrap-anywhere tw:text-[var(--ink-faint)]">
          <a href={gitlab.identity.url} target="_blank" rel="noreferrer">
            {gitlab.identity.projectPath} !{gitlab.identity.iid}
          </a>
          <span>
            {gitlab.identity.host} ·{" "}
            {gitlab.account
              ? `Posting as @${gitlab.account.username}`
              : "Posting account unavailable"}
          </span>
        </div>
      )}
      {!comments.editable && <p>Open the current review to write comments.</p>}
      {comments.error && <p role="alert">{comments.error}</p>}
      {gitlab?.connectionError && <p role="alert">{gitlab.connectionError}</p>}
      {gitlab?.sourceError && <p role="alert">{gitlab.sourceError}</p>}
      <h3 className={heading}>Comments · {open.length}</h3>
      {comments.state && open.length === 0 && <p>No open comments.</p>}
      {open.map((entry) =>
        entry.kind === "draft" ? (
          <DraftEditor key={entry.id} draft={entry.draft} />
        ) : (
          renderThread(entry)
        ),
      )}
      {gitlab && (
        <Collapsible
          summary={`Resolved · ${resolved.length}`}
          open={resolved.some(
            (t) =>
              t.id === comments.selected ||
              t.replies.some((d) => d.id === comments.selected),
          )}
        >
          {resolved.map(renderThread)}
        </Collapsible>
      )}
    </div>
  );
}

function targetLabel(target: CommentTarget) {
  if (target.kind === "general") return "General comment";

  if (target.kind === "reply") return "Reply to discussion";
  const p = target.position;

  return `${p.side === "head" ? p.newPath : p.oldPath}:${p.from}${p.to !== p.from ? `–${p.to}` : ""} · ${p.side}`;
}

export type CommentAnnotation =
  | { kind: "discussion"; id: string }
  | { kind: "draft"; id: string }
  | { kind: "collapsed"; ids: string[] };

function hasUnsentReply(discussion: GitLabDiscussion, drafts: ReviewComment[]) {
  return drafts.some(
    (d) =>
      d.status !== "sent" &&
      d.target.kind === "reply" &&
      d.target.discussionId === discussion.id,
  );
}

/** Threads with local drafts stay open so the draft is never hidden. */
export function discussionCollapsed(
  discussion: GitLabDiscussion,
  collapsed: Record<string, boolean>,
  drafts: ReviewComment[],
) {
  return (
    !hasUnsentReply(discussion, drafts) &&
    (collapsed[discussion.id] ?? discussion.resolved)
  );
}

export function InlineComments({
  annotation,
}: {
  annotation: CommentAnnotation;
}) {
  const comments = useComments();
  const drafts = useCommentDrafts();

  if (!comments) return null;

  if (annotation.kind === "collapsed")
    return <CommentChips ids={annotation.ids} />;

  const discussion =
    annotation.kind === "discussion"
      ? comments.state?.gitlab?.discussions.find((d) => d.id === annotation.id)
      : undefined;

  const local = drafts.filter(
    (d) =>
      d.status !== "sent" &&
      (annotation.kind === "draft"
        ? d.id === annotation.id
        : d.target.kind === "reply" && d.target.discussionId === annotation.id),
  );

  if (!discussion && local.length === 0) return null;

  return (
    <section
      className="tw:m-0 tw:box-border tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-2 tw:whitespace-normal tw:bg-[var(--surface)] tw:p-3 tw:font-[family-name:var(--chrome-font)] tw:text-[13px] tw:text-[var(--ink)]"
      aria-label={`${annotation.kind === "draft" ? "Comment" : "GitLab discussion"} ${annotation.id}`}
    >
      {comments.error && <p role="alert">{comments.error}</p>}
      <div className="tw:flex tw:max-w-[820px] tw:flex-col">
        {discussion && (
          <Discussion
            discussion={discussion}
            inline
            collapsible={local.length === 0}
          />
        )}
        {local.map((draft) => (
          <DraftEditor
            key={draft.id}
            draft={draft}
            inline
            attached={!!discussion}
          />
        ))}
      </div>
    </section>
  );
}

/** Collapsed comments take no height; their chips overlay the right end of the commented line. */
function CommentChips({ ids }: { ids: string[] }) {
  const comments = useComments()!;
  const drafts = useCommentDrafts();

  const chips = ids.flatMap((id) => {
    const discussion = comments.state?.gitlab?.discussions.find(
      (d) => d.id === id,
    );

    if (discussion) {
      const author = discussion.comments[0]?.author.username;

      return [
        {
          id,
          label: `${discussion.resolved ? "resolved " : ""}discussion by @${author}`,
          text: `@${author}${discussion.comments.length > 1 ? ` · ${discussion.comments.length}` : ""}`,
          title: `@${author}: ${discussion.comments[0]?.body.slice(0, 200)}`,
          resolved: discussion.resolved,
        },
      ];
    }

    const draft = drafts.find((d) => d.id === id && d.status !== "sent");

    return draft
      ? [
          {
            id,
            label: draft.author === "agent" ? "agent draft" : "your draft",
            text: `${draft.author === "agent" ? "Agent" : "You"} · Draft`,
            title: draft.text.slice(0, 200),
            resolved: false,
          },
        ]
      : [];
  });

  // A lone comment has room for its author; a stack shows state colors only.
  const single = chips.length === 1;

  return (
    <section className="tw:relative tw:h-0" aria-label="Collapsed comments">
      <div className="tw:absolute tw:right-3 tw:bottom-px tw:flex tw:font-[family-name:var(--chrome-font)] tw:text-[11px]">
        {chips.map((chip, index) => {
          const Icon = chip.resolved ? CheckIcon : MessageSquareIcon;

          return (
            <button
              key={chip.id}
              type="button"
              aria-expanded={false}
              aria-label={`Expand ${chip.label}`}
              title={chip.title}
              onClick={() => comments.collapse(chip.id, false)}
              className={cn(
                "tw:flex tw:h-[18px] tw:cursor-pointer tw:items-center tw:justify-center tw:gap-1 tw:rounded-full tw:border tw:bg-[var(--surface-raised)] tw:whitespace-nowrap tw:hover:z-[1] tw:hover:text-[var(--ink)]",
                single ? "tw:px-2" : "tw:w-[18px]",
                index > 0 && "tw:-ms-1",
                chip.resolved
                  ? "tw:border-[var(--chrome-border)] tw:text-[var(--ink-muted)]"
                  : "tw:border-[color-mix(in_srgb,var(--link)_40%,transparent)] tw:text-[var(--link)]",
              )}
            >
              <Icon className="tw:size-3 tw:shrink-0" aria-hidden="true" />
              {single && chip.text}
            </button>
          );
        })}
      </div>
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
  collapsible = false,
}: {
  discussion: GitLabDiscussion;
  inline?: boolean;
  /** Threads with local drafts stay open so the draft is never hidden. */
  collapsible?: boolean;
}) {
  const comments = useComments()!;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!inline && comments.selected === discussion.id)
      ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [comments.selected, discussion.id, inline]);

  // Inline threads render only when expanded; collapsed ones become line chips.
  const collapsed =
    !inline &&
    collapsible &&
    (comments.collapsed[discussion.id] ?? discussion.resolved);

  const first = discussion.comments[0];

  return (
    <div
      ref={ref}
      className={cn(
        card,
        inlineCard,
        "tw:relative tw:z-[1]",
        comments.selected === discussion.id && "tw:border-[var(--ink-faint)]",
      )}
    >
      {inline ? null : discussion.location ? (
        <Button
          variant="ghost"
          className="tw:h-auto tw:self-start tw:bg-transparent tw:px-0 tw:has-[>svg]:px-0 tw:text-[11px] tw:text-[color:var(--ink-faint)] tw:hover:text-[color:var(--ink)]"
          onClick={() => comments.select(discussion)}
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
      {collapsed && first ? (
        <div className="tw:flex tw:min-w-0 tw:items-baseline tw:gap-2">
          {/* Blocks flow inline so the rendered body still truncates to one line. */}
          <div className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[var(--ink-muted)] tw:[&_*]:inline tw:[&_*]:m-0 tw:[&_img]:hidden">
            <strong className="tw:text-[var(--ink)]">
              {authorName(first.author, comments.state?.gitlab?.account?.id)}
            </strong>{" "}
            <MarkdownContent source={first.body} />
          </div>
          {discussion.comments.length > 1 && (
            <span className={meta}>{discussion.comments.length}</span>
          )}
          <Button
            variant="ghost"
            className={cn(textAction, "tw:h-auto")}
            aria-expanded={false}
            onClick={() => comments.collapse(discussion.id, false)}
          >
            Expand
          </Button>
        </div>
      ) : (
        <>
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
                    {authorName(
                      note.author,
                      comments.state?.gitlab?.account?.id,
                    )}
                  </strong>
                  {note.author.bot && <span className={meta}>bot</span>}
                  <time
                    className={meta}
                    dateTime={note.createdAt}
                    title={new Date(note.createdAt).toLocaleString()}
                  >
                    {relativeTime(note.createdAt)}
                  </time>
                  {collapsible && index === 0 && (
                    <IconButton
                      aria-label="Collapse discussion"
                      title="Collapse discussion"
                      className="tw:ms-auto"
                      onClick={() => comments.collapse(discussion.id, true)}
                    >
                      <ChevronsDownUpIcon aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
                <NoteBody source={note.body} />
              </div>
            </div>
          ))}
          <div className={cn(actions, "tw:ms-11 tw:items-center")}>
            <Button
              variant="ghost"
              className={textAction}
              disabled={!comments.editable || comments.busy}
              onClick={() =>
                comments.compose(
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
                  comments.pending?.action === "resolve" &&
                  comments.pending.input.discussionId === discussion.id
                }
                disabled={!comments.editable || comments.busy}
                onClick={() =>
                  comments.run("resolve", { discussionId: discussion.id })
                }
              >
                Resolve
              </Button>
            )}
            {discussion.resolved && <span className={meta}>Resolved</span>}
            <a
              className="tw:ms-auto tw:text-[11px] tw:text-[var(--ink-faint)] tw:no-underline tw:hover:underline"
              href={comments.state?.gitlab?.identity.url}
              target="_blank"
              rel="noreferrer"
            >
              View on GitLab
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function authorName(
  author: GitLabDiscussion["comments"][number]["author"],
  accountId: number | undefined,
) {
  return author.id === accountId ? "You" : author.name || author.username;
}

function DraftEditor({
  draft,
  inline = false,
  attached = false,
}: {
  draft: ReviewComment;
  inline?: boolean;
  attached?: boolean;
}) {
  const comments = useComments()!;
  const ref = useRef<HTMLDivElement>(null);
  const editor = comments.editors[draft.id];
  const labelId = useId();
  const collapsed = comments.collapsed[draft.id] ?? false;
  const [verified, setVerified] = useState(false);
  const [noteId, setNoteId] = useState("");
  const locked = !["saved", "failed"].includes(draft.status);
  const target = editor?.target ?? draft.target;
  const gitlab = comments.state?.gitlab;
  useEffect(() => {
    if (!inline && !collapsed && comments.selected === draft.id)
      ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [comments.selected, draft.id, inline, collapsed]);

  const canPost =
    !!gitlab &&
    comments.editable &&
    !comments.busy &&
    !!(editor?.text ?? draft.text).trim() &&
    !(draft.target.kind === "inline" && draft.target.unmapped);

  const thread =
    target.kind === "reply"
      ? comments.state?.gitlab?.discussions.find(
          (d) => d.id === target.discussionId,
        )
      : undefined;

  const saveStatus = (
    <span
      className={cn(
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
      ref={ref}
      className={cn(
        card,
        inline && inlineCard,
        attached &&
          "tw:mx-3 tw:-mt-2 tw:bg-[var(--surface)] tw:pt-5 tw:motion-safe:animate-[comment-reply-enter_180ms_cubic-bezier(0.16,1,0.3,1)]",
      )}
    >
      <div className="tw:flex tw:items-center tw:gap-2">
        <span className="tw:min-w-0 tw:wrap-anywhere" id={labelId}>
          {targetLabel(editor?.target ?? draft.target)}
        </span>
        {draft.author === "agent" && <Chip className="tw:me-auto">Agent</Chip>}
        <IconButton
          aria-label={collapsed ? "Expand discussion" : "Collapse discussion"}
          title={collapsed ? "Expand discussion" : "Collapse discussion"}
          aria-expanded={!collapsed}
          aria-controls={`${labelId}-body`}
          className="tw:ms-auto"
          onClick={() => comments.collapse(draft.id, !collapsed)}
        >
          {collapsed ? (
            <ChevronRightIcon aria-hidden="true" />
          ) : (
            <ChevronsDownUpIcon aria-hidden="true" />
          )}
        </IconButton>
      </div>

      <div
        id={`${labelId}-body`}
        className={collapsed ? "tw:hidden" : "tw:contents"}
      >
        {thread && !inline && !attached && (
          <Button variant="ghost" onClick={() => comments.select(thread)}>
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
          onChange={(text) => comments.edit(draft.id, text)}
          onSubmit={() => {
            if (canPost) comments.run("post", { id: draft.id });
          }}
          disabled={!comments.editable || comments.busy || locked}
          focused={!collapsed && comments.selected === draft.id}
          placeholder="Write your comment…"
          labelledBy={labelId}
          inline={inline}
        />
        {(editor?.error || draft.error) && (
          <p role="alert">{editor?.error ?? draft.error}</p>
        )}
        {!locked ? (
          <div className={cn(actions, "tw:items-center")}>
            {gitlab && (
              <Button
                variant="primary"
                loading={
                  comments.pending?.action === "post" &&
                  comments.pending.input.id === draft.id
                }
                disabled={!canPost}
                onClick={() => comments.run("post", { id: draft.id })}
              >
                Post
              </Button>
            )}
            <Button
              loading={
                comments.pending?.action === "discard" &&
                comments.pending.input.id === draft.id
              }
              disabled={!comments.editable || comments.busy}
              onClick={() => comments.run("discard", { id: draft.id })}
            >
              Discard
            </Button>
            {editor?.error && (
              <Button
                disabled={comments.busy}
                onClick={() => comments.edit(draft.id, editor.text)}
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
                disabled={!comments.editable || comments.busy}
                onCheckedChange={(checked) => setVerified(checked === true)}
              />{" "}
              I checked this MR on GitLab and verified the outcome
            </label>
            <Button
              loading={
                comments.pending?.action === "recover" &&
                comments.pending.input.id === draft.id &&
                comments.pending.input.posted === false
              }
              disabled={!verified || !comments.editable || comments.busy}
              onClick={() =>
                comments.run("recover", {
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
                comments.pending?.action === "recover" &&
                comments.pending.input.id === draft.id &&
                comments.pending.input.posted === true
              }
              disabled={
                !verified ||
                !Number.isSafeInteger(Number(noteId)) ||
                Number(noteId) < 1 ||
                !comments.editable ||
                comments.busy
              }
              onClick={() =>
                comments.run("recover", {
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

const inlineCard = "tw:max-w-[820px] tw:gap-3 tw:bg-[var(--surface-raised)]";

const actions = "tw:flex tw:flex-wrap tw:gap-2";

const heading = "tw:m-0 tw:text-[13px] tw:font-semibold";

const meta = "tw:text-[11px] tw:text-[var(--ink-faint)]";

const textAction =
  "tw:bg-transparent tw:px-0 tw:has-[>svg]:px-0 tw:text-[13px] tw:text-[color:var(--link)]";
