export interface ReviewSessionData {
  /** Absent for a review. The scratchpad hides review-only chrome. */
  kind?: "scratchpad";
  /** Absent for a document whose references all carry their own pins. */
  pins?: { base: string; head: string; worktreeRevision?: string };
  /** Changes whenever the review's comments do. */
  commentsRevision?: number;
  /** `worktree` when the head side is the checkout's working files rather
   * than the pinned head commit. */
  targetKind?: "worktree" | "commits";
  historicalRevision: string | null;
  updatedAtMs: number;
  /** Head branch captured with the displayed snapshot. */
  headBranch?: string;
  dismiss(): Promise<void>;
}
