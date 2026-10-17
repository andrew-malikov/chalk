import type { Database } from "bun:sqlite";

import {
  type GitLabIdentity,
  type GitLabState,
  gitLabStateSchema,
} from "@chalk/review-contracts";
import { ReviewInputError } from "@review/documents/document.js";

/** Provider state for a review's MR; comments live in CommentStorage. */
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
}
