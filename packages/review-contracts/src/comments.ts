import { z } from "zod";

import { gitLabStateSchema } from "./gitlab.js";

const line = z.number().int().positive();

/** Lines in one side of the review's pinned comparison; GitLab derives its own position when posting. */
export const commentPositionSchema = z
  .object({
    baseSha: z.string().min(1),
    headSha: z.string().min(1),
    /** Set by the host for worktree reviews, whose head side is the working files. */
    worktreeRevision: z.string().optional(),
    oldPath: z.string().min(1),
    newPath: z.string().min(1),
    side: z.enum(["base", "head"]),
    from: line,
    to: line,
    /** Set by the host: the selected lines with surrounding context, to follow them when the source changes. */
    context: z
      .object({
        start: z.number().int().nonnegative(),
        lines: z.array(z.string()),
        digest: z.string(),
      })
      .optional(),
  })
  .refine((value) => value.to >= value.from, "Invalid line range.");

export type CommentPosition = z.infer<typeof commentPositionSchema>;

export const commentTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("general") }),
  /** A reply to a provider discussion. */
  z.object({ kind: z.literal("reply"), discussionId: z.string().min(1) }),
  z.object({
    kind: z.literal("inline"),
    position: commentPositionSchema,
    unmapped: z.boolean().optional(),
  }),
]);

export type CommentTarget = z.infer<typeof commentTargetSchema>;

export const reviewCommentSchema = z.object({
  id: z.uuid(),
  text: z.string().max(1_000_000),
  author: z.enum(["user", "agent"]),
  target: commentTargetSchema,
  version: z.number().int().nonnegative(),
  /** Anything but `saved` comes from sending it to a provider. */
  status: z.enum(["saved", "failed", "sending", "uncertain", "sent"]),
  error: z.string().optional(),
  noteId: line.optional(),
});

export type ReviewComment = z.infer<typeof reviewCommentSchema>;

export const saveCommentSchema = z.strictObject({
  id: z.uuid(),
  text: z.string().max(1_000_000),
  target: commentTargetSchema,
  version: z.number().int().nonnegative().optional(),
});

/** Comments are Chalk's; `gitlab` is present when the review has a provider to send them to. */
export const commentsStateSchema = z.object({
  comments: z.array(reviewCommentSchema),
  gitlab: gitLabStateSchema.optional(),
});

export type CommentsState = z.infer<typeof commentsStateSchema>;
