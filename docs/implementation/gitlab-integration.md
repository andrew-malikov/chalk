# GitLab integration implementation plan

Spec: [SPEC.md](../../SPEC.md). Execute in this session, one task at a time.

Keep the prototype on `prototype/gitlab-discussions`. Production work lives on
`feat/gitlab-integration`; use existing review storage, APIs, panel frame, and StyleX.

1. Add `packages/review-protocol/src/gitlab.ts` for validated identity, positions,
   discussions, drafts, and transport schemas. Add backend URL parsing, authenticated
   glab transport, paginated discussion import, and conservative line mapping in
   `packages/review/src/review-api/gitlab.ts`. Test invalid URLs, host isolation,
   system filtering, ambiguous mapping, and remote errors before implementing.
2. Add `gitlab-state.ts` using ReviewStore's SQLite connection. Implement revisioned
   draft saves and persisted sending/confirmed/failed/uncertain outcomes. Add the
   managed-clone/service module; extend `store.ts`, `local-data.ts`, `http.ts`, and
   `authoring-tools.ts` for MCP creation and explicit UI operations. Test with real
   scratch Git repositories and durable databases; fake only the GitLab boundary.
   Exercise deduplication, partial posting, interrupted posting, save conflicts,
   cache reacquisition, dirty/committed checkout refusal, and reply retention.
3. Add a GitLab context/panel next to existing review panels. Extend session metadata
   in `api-canvas.tsx`; integrate panel controls in `App.tsx`, manual inline drafting
   in the existing selection toolbar, and mapped markers/navigation in
   `PierreDiffView.tsx`. Use optimistic save revisions and a serialized save queue;
   show unsaved failures and flush before posting. Add behavioral UI tests.
4. Run targeted Vitest lanes, typechecks, lint/format, desktop build, then repository
   tests. Fix failures at their cause. Verify the actual production UI against a
   fixture transport in the collaborative browser. Report live GitLab validation
   separately; this environment currently has no glab executable.

The uncertain-post UI requires explicit user verification before another attempt.
Content matching cannot establish that an earlier request created a specific note.
Remote payloads and subprocess errors must be validated/redacted at the boundary.
