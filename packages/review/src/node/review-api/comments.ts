import {
  type CommentPosition,
  type CommentsState,
  type ReviewComment,
  type saveCommentSchema,
} from "@chalk/review-contracts";
import { type Pins, ReviewInputError } from "@review/documents/document.js";
import { z } from "zod";

import { findLineRange, lineContext } from "./gitlab.js";
import type { LocalReviewData } from "./local-data.js";
import type { ReviewStore } from "./store.js";

const line = z.number().int().positive();

export const agentCommentSchema = z.strictObject({
  text: z.string().trim().min(1).max(1_000_000).describe("Markdown."),
  source: z
    .strictObject({
      side: z.enum(["base", "head"]).default("head"),
      file: z.string().min(1),
      fromLine: line,
      toLine: line,
    })
    .refine(
      (s) => s.toLine >= s.fromLine,
      "Source range ends before it starts.",
    )
    .optional()
    .describe(
      "Lines of the review's current target the comment is about. Omit for a general comment.",
    ),
  discussionId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Reply to this GitLab discussion from review_comment_list instead.",
    ),
});

const isOpen = (comment: ReviewComment) =>
  ["saved", "failed"].includes(comment.status);

const moved = (position: CommentPosition, pins: Pins) =>
  position.baseSha !== pins.base ||
  position.headSha !== pins.head ||
  position.worktreeRevision !== pins.worktreeRevision;

/** Chalk's review comments; a provider such as GitLab only sends them. */
export class ReviewComments {
  constructor(
    private readonly store: ReviewStore,
    private readonly data: LocalReviewData,
  ) {}
  /** Comments with inline ones followed to the review's current source, and the provider state if any. */
  async state(id: string): Promise<CommentsState> {
    await this.remap(id);

    return {
      comments: this.store.comments.read(id),
      ...(this.store.read(id).origin?.gitlab && {
        gitlab: this.store.gitlab.read(id),
      }),
    };
  }
  async save(id: string, input: z.infer<typeof saveCommentSchema>) {
    // A saved comment keeps its target; only new ones are checked here.
    if (this.store.comments.read(id).some((c) => c.id === input.id))
      return this.store.comments.save(id, input);

    if (input.target.kind === "reply" && !this.store.read(id).origin?.gitlab)
      throw new ReviewInputError("Only GitLab discussions take replies.");

    if (input.target.kind === "inline")
      input = {
        ...input,
        target: {
          kind: "inline",
          position: await this.locate(id, input.target.position),
        },
      };

    return this.store.comments.save(id, input);
  }
  /** Agent comments are proposals: ordinary saved comments the user edits, sends or discards. All or none are added. */
  async add(id: string, inputs: z.infer<typeof agentCommentSchema>[]) {
    const snapshot = this.store.read(id);
    const pins = snapshot.pins;

    const added = await Promise.all(
      inputs.map(async ({ text, source, discussionId }) => {
        if (source && discussionId)
          throw new ReviewInputError(
            "Supply source or discussionId, not both.",
          );

        if (discussionId && !snapshot.origin?.gitlab)
          throw new ReviewInputError("Only GitLab discussions take replies.");

        if (source && !pins)
          throw new ReviewInputError(
            "This review has no source to comment on.",
          );

        const target: ReviewComment["target"] = source
          ? {
              kind: "inline",
              position: await this.locate(id, {
                baseSha: pins!.base,
                headSha: pins!.head,
                oldPath: source.file,
                newPath: source.file,
                side: source.side,
                from: source.fromLine,
                to: source.toLine,
              }),
            }
          : discussionId
            ? { kind: "reply", discussionId }
            : { kind: "general" };

        return {
          id: crypto.randomUUID(),
          text,
          author: "agent" as const,
          target,
          version: 1,
          status: "saved" as const,
        };
      }),
    );

    this.store.comments.update(id, (comments) => {
      comments.push(...added);
    });

    return added;
  }
  /** Checks a new selection against the current source and records the context that follows it. */
  private async locate(
    id: string,
    position: CommentPosition,
  ): Promise<CommentPosition> {
    const pins = this.store.read(id).pins;

    if (
      !pins ||
      position.baseSha !== pins.base ||
      position.headSha !== pins.head
    )
      throw new ReviewInputError(
        "Source changed. Select the current code again.",
        409,
      );

    const { text } = await this.data.file(
      pins,
      position.side,
      position.side === "head" ? position.newPath : position.oldPath,
    );

    const context = lineContext(text, position.from, position.to);

    if (!context) throw new ReviewInputError("Selected lines are unavailable.");

    return { ...position, worktreeRevision: pins.worktreeRevision, context };
  }
  /** Moves inline comments to the current pins, or marks them unmapped when their lines changed. */
  private async remap(id: string) {
    const pins = this.store.read(id).pins;

    if (!pins) return;

    const stale = this.store.comments
      .read(id)
      .flatMap((comment) =>
        comment.target.kind === "inline" &&
        !comment.target.unmapped &&
        isOpen(comment) &&
        moved(comment.target.position, pins)
          ? [{ id: comment.id, before: comment.target.position }]
          : [],
      );

    if (!stale.length) return;

    const mapped = await Promise.all(
      stale.map(async ({ id, before }) => {
        try {
          const { text } = await this.data.file(
            pins,
            before.side,
            before.side === "head" ? before.newPath : before.oldPath,
          );

          const range =
            before.context &&
            findLineRange(before.context, text, before.from, before.to);

          if (range)
            return {
              id,
              before,
              target: {
                kind: "inline" as const,
                position: {
                  ...before,
                  ...range,
                  baseSha: pins.base,
                  headSha: pins.head,
                  worktreeRevision: pins.worktreeRevision,
                  context: lineContext(text, range.from, range.to)!,
                },
                unmapped: false,
              },
            };
        } catch {
          /* A missing file leaves the comment unmapped. */
        }

        return {
          id,
          before,
          target: { kind: "inline" as const, position: before, unmapped: true },
        };
      }),
    );

    // Text edits keep their version: a target change must not fail a save in flight.
    this.store.comments.update(id, (comments) => {
      for (const { id, before, target } of mapped) {
        const comment = comments.find((c) => c.id === id);

        if (
          comment?.target.kind === "inline" &&
          isOpen(comment) &&
          JSON.stringify(comment.target.position) === JSON.stringify(before)
        )
          comment.target = target;
      }
    });
  }
}
