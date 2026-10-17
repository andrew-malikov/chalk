import { z } from "zod";

const sha = z.string().regex(/^[a-f0-9]{40}$/i);

const line = z.number().int().positive();

export const gitLabRefsSchema = z.object({
  baseSha: sha,
  startSha: sha,
  headSha: sha,
});

export type GitLabRefs = z.infer<typeof gitLabRefsSchema>;

export const gitLabIdentitySchema = z.object({
  url: z.string().url(),
  host: z.string().min(1),
  projectId: line,
  projectPath: z.string().min(1),
  iid: line,
  cloneUrl: z.string().min(1),
});

export type GitLabIdentity = z.infer<typeof gitLabIdentitySchema>;

export const gitLabAccountSchema = z.object({
  id: line,
  username: z.string(),
  name: z.string(),
  bot: z.boolean().optional(),
});

export type GitLabAccount = z.infer<typeof gitLabAccountSchema>;

export const gitLabPositionSchema = gitLabRefsSchema
  .extend({
    oldPath: z.string().min(1),
    newPath: z.string().min(1),
    side: z.enum(["base", "head"]),
    from: line,
    to: line,
    oppositeFrom: line.optional(),
    oppositeTo: line.optional(),
  })
  .refine((value) => value.to >= value.from, "Invalid line range.");

export type GitLabPosition = z.infer<typeof gitLabPositionSchema>;

export const gitLabDiscussionSchema = z.object({
  id: z.string(),
  resolved: z.boolean(),
  resolvable: z.boolean(),
  position: gitLabPositionSchema.optional(),
  location: z
    .object({
      file: z.string(),
      side: z.enum(["base", "head"]),
      from: line,
      to: line,
    })
    .optional(),
  comments: z.array(
    z.object({
      id: line,
      body: z.string(),
      author: gitLabAccountSchema,
      createdAt: z.string(),
    }),
  ),
});

export type GitLabDiscussion = z.infer<typeof gitLabDiscussionSchema>;

export const gitLabStateSchema = z.object({
  identity: gitLabIdentitySchema,
  account: gitLabAccountSchema.nullable(),
  refs: gitLabRefsSchema,
  discussions: z.array(gitLabDiscussionSchema),
  connectionError: z.string().optional(),
  sourceError: z.string().optional(),
  refreshedAt: z.string().optional(),
});

export type GitLabState = z.infer<typeof gitLabStateSchema>;
