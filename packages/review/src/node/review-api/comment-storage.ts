import type { Database } from "bun:sqlite";

import {
  type ReviewComment,
  reviewCommentSchema,
  type saveCommentSchema,
} from "@chalk/review-contracts";
import { ReviewInputError } from "@review/documents/document.js";
import { z } from "zod";

const commentsSchema = z.array(reviewCommentSchema);

/** Comments live outside snapshot history. SQLite transactions coordinate separate hosts. */
export class CommentStorage {
  private readonly listeners = new Set<(reviewId: string) => void>();
  constructor(private readonly db: Database) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS review_comments(review_id TEXT PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE, revision INTEGER NOT NULL, comments TEXT NOT NULL)`,
    );
  }
  /** shortcut: only notifies writers in this process; poll `revision` if separate hosts must see each other live. */
  subscribe(listener: (reviewId: string) => void) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
  private row(id: string) {
    return this.db
      .query<{ revision: number; comments: string }, [string]>(
        "SELECT revision, comments FROM review_comments WHERE review_id=?",
      )
      .get(id);
  }
  /** Bumped by every change, so viewers know to reload. */
  revision(id: string) {
    return this.row(id)?.revision ?? 0;
  }
  read(id: string): ReviewComment[] {
    const row = this.row(id);

    return row ? commentsSchema.parse(JSON.parse(row.comments)) : [];
  }
  update<T>(id: string, change: (comments: ReviewComment[]) => T): T {
    const result = this.db
      .transaction(() => {
        const comments = this.read(id);
        const result = change(comments);
        this.db
          .query(
            "INSERT INTO review_comments VALUES(?,1,?) ON CONFLICT(review_id) DO UPDATE SET revision=revision+1, comments=excluded.comments",
          )
          .run(id, JSON.stringify(commentsSchema.parse(comments)));

        return result;
      })
      .immediate();

    for (const listener of this.listeners)
      try {
        listener(id);
      } catch {
        // A disconnected viewer must not reject the saved change.
      }

    return result;
  }
  save(id: string, input: z.infer<typeof saveCommentSchema>): ReviewComment {
    return this.update(id, (comments) => {
      const existing = comments.find((c) => c.id === input.id);

      if (existing && !["saved", "failed"].includes(existing.status))
        throw new ReviewInputError(
          `Comment is ${existing.status}; verify the outcome before editing.`,
          409,
        );

      if (
        existing
          ? input.version !== existing.version
          : input.version !== undefined
      )
        throw new ReviewInputError(
          "Comment changed. Reopen it before saving.",
          409,
        );

      const comment: ReviewComment = {
        id: input.id,
        text: input.text,
        author: existing?.author ?? "user",
        target: existing?.target ?? input.target,
        version: (existing?.version ?? 0) + 1,
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
        status: "saved",
      };

      if (existing) Object.assign(existing, comment, { error: undefined });
      else comments.push(comment);

      return comment;
    });
  }
  discard(id: string, commentId: string) {
    this.update(id, (comments) => {
      const comment = this.comment(comments, commentId);

      if (!["saved", "failed"].includes(comment.status))
        throw new ReviewInputError(
          `Comment is ${comment.status}; it cannot be discarded.`,
          409,
        );
      comments.splice(comments.indexOf(comment), 1);
    });
  }
  beginPost(id: string, commentId: string): ReviewComment | undefined {
    return this.update(id, (comments) => {
      const comment = this.comment(comments, commentId);

      if (!["saved", "failed"].includes(comment.status)) return undefined;

      if (!comment.text.trim())
        throw new ReviewInputError("Write a comment before posting.");

      if (comment.target.kind === "inline" && comment.target.unmapped)
        throw new ReviewInputError(
          "Select the current code again before posting this unmapped comment.",
          409,
        );
      comment.status = "sending";
      comment.error = undefined;
      comment.version++;

      return structuredClone(comment);
    });
  }
  finishPost(
    id: string,
    commentId: string,
    result: Pick<ReviewComment, "status" | "error" | "noteId">,
  ) {
    this.update(id, (comments) => {
      const comment = this.comment(comments, commentId);

      if (comment.status !== "sending")
        throw new ReviewInputError("Post outcome changed.", 409);
      Object.assign(comment, result);
      comment.version++;
    });
  }
  recover(id: string, commentId: string, posted: boolean, noteId?: number) {
    this.update(id, (comments) => {
      const comment = this.comment(comments, commentId);

      if (comment.status !== "uncertain" && comment.status !== "sending")
        throw new ReviewInputError(
          "Only an unconfirmed post needs verification.",
          409,
        );

      if (posted && !noteId)
        throw new ReviewInputError("Supply the verified GitLab note ID.");
      Object.assign(comment, {
        status: posted ? "sent" : "saved",
        noteId: posted ? noteId : undefined,
        error: undefined,
        version: comment.version + 1,
      });
    });
  }
  private comment(comments: ReviewComment[], id: string) {
    const comment = comments.find((c) => c.id === id);

    if (!comment) throw new ReviewInputError("Comment not found.", 404);

    return comment;
  }
}
