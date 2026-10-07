import type { Database } from "bun:sqlite";

import {
  type GitLabDraft,
  type GitLabIdentity,
  type GitLabState,
  gitLabSaveDraftSchema,
  gitLabStateSchema,
} from "@dev.fast/review-protocol";
import type { z } from "zod";

import { ReviewInputError } from "./document.js";

/** Drafts live outside snapshot history. SQLite transactions coordinate separate hosts. */
export class GitLabStorage {
  constructor(private readonly db: Database) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS gitlab_reviews(review_id TEXT PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE, identity TEXT NOT NULL UNIQUE, state TEXT NOT NULL)`,
    );
  }
  find(identity: Pick<GitLabIdentity, "host" | "projectId" | "iid">) {
    return this.db
      .query<{ review_id: string }, [string]>(
        "SELECT review_id FROM gitlab_reviews WHERE identity=?",
      )
      .get(this.key(identity))?.review_id;
  }
  private key(identity: Pick<GitLabIdentity, "host" | "projectId" | "iid">) {
    return JSON.stringify([identity.host, identity.projectId, identity.iid]);
  }
  seed(id: string, state: GitLabState) {
    this.db
      .query("INSERT INTO gitlab_reviews VALUES(?,?,?)")
      .run(
        id,
        this.key(state.identity),
        JSON.stringify(gitLabStateSchema.parse(state)),
      );
  }
  read(id: string): GitLabState {
    const row = this.db
      .query<{ state: string }, [string]>(
        "SELECT state FROM gitlab_reviews WHERE review_id=?",
      )
      .get(id);

    if (!row) throw new ReviewInputError("This review has no GitLab MR.", 404);

    return gitLabStateSchema.parse(JSON.parse(row.state));
  }
  update<T>(id: string, change: (state: GitLabState) => T): T {
    return this.db
      .transaction(() => {
        const state = this.read(id);
        const result = change(state);
        this.db
          .query("UPDATE gitlab_reviews SET state=? WHERE review_id=?")
          .run(JSON.stringify(gitLabStateSchema.parse(state)), id);

        return result;
      })
      .immediate();
  }
  save(id: string, input: z.infer<typeof gitLabSaveDraftSchema>): GitLabDraft {
    return this.update(id, (state) => {
      const existing = state.drafts.find((d) => d.id === input.id);

      if (existing && !["saved", "failed"].includes(existing.status))
        throw new ReviewInputError(
          `Draft is ${existing.status}; verify the outcome before editing.`,
          409,
        );

      if (
        existing
          ? input.version !== existing.version
          : input.version !== undefined
      )
        throw new ReviewInputError(
          "Draft changed. Reopen it before saving.",
          409,
        );

      const draft: GitLabDraft = {
        id: input.id,
        text: input.text,
        target: input.target,
        version: (existing?.version ?? 0) + 1,
        status: "saved",
      };

      if (existing) Object.assign(existing, draft, { error: undefined });
      else state.drafts.push(draft);

      return draft;
    });
  }
  discard(id: string, draftId: string) {
    this.update(id, (state) => {
      const draft = this.draft(state, draftId);

      if (!["saved", "failed"].includes(draft.status))
        throw new ReviewInputError(
          `Draft is ${draft.status}; it cannot be discarded.`,
          409,
        );
      state.drafts = state.drafts.filter((d) => d.id !== draftId);
    });
  }
  beginPost(id: string, draftId: string): GitLabDraft | undefined {
    return this.update(id, (state) => {
      const draft = this.draft(state, draftId);

      if (!["saved", "failed"].includes(draft.status)) return undefined;

      if (!draft.text.trim())
        throw new ReviewInputError("Write a comment before posting.");

      if (draft.target.kind === "inline" && draft.target.unmapped)
        throw new ReviewInputError(
          "Select the current code again before posting this unmapped draft.",
          409,
        );
      draft.status = "sending";
      draft.error = undefined;
      draft.version++;

      return structuredClone(draft);
    });
  }
  finishPost(
    id: string,
    draftId: string,
    result: Pick<GitLabDraft, "status" | "error" | "noteId">,
  ) {
    this.update(id, (state) => {
      const draft = this.draft(state, draftId);

      if (draft.status !== "sending")
        throw new ReviewInputError("Post outcome changed.", 409);
      Object.assign(draft, result);
      draft.version++;
    });
  }
  recover(id: string, draftId: string, posted: boolean, noteId?: number) {
    this.update(id, (state) => {
      const draft = this.draft(state, draftId);

      if (draft.status !== "uncertain" && draft.status !== "sending")
        throw new ReviewInputError(
          "Only an unconfirmed post needs verification.",
          409,
        );

      if (posted && !noteId)
        throw new ReviewInputError("Supply the verified GitLab note ID.");
      Object.assign(draft, {
        status: posted ? "sent" : "saved",
        noteId: posted ? noteId : undefined,
        error: undefined,
        version: draft.version + 1,
      });
    });
  }
  private draft(state: GitLabState, id: string) {
    const draft = state.drafts.find((d) => d.id === id);

    if (!draft) throw new ReviewInputError("Draft not found.", 404);

    return draft;
  }
}
