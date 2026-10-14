import { execFile } from "node:child_process";
import { createHash } from "node:crypto";

import type { JsonValue } from "@chalk/json";
import {
  type GitLabDiscussion,
  type GitLabPosition,
  gitLabAccountSchema,
} from "@chalk/review-contracts";
import { ReviewInputError } from "@review/documents/document.js";
import { z } from "zod";

export const mergeRequestUrlSchema = z.string().transform((value, context) => {
  try {
    return mergeRequestAddress(value).url;
  } catch {
    context.addIssue({
      code: "custom",
      message:
        "Use a canonical HTTPS GitLab MR URL: https://host/group/project/-/merge_requests/123.",
    });

    return z.NEVER;
  }
});

export function mergeRequestAddress(value: string) {
  // Validate raw spelling before URL normalizes dot segments or credentials.
  const match =
    /^https:\/\/([a-zA-Z0-9.-]+(?::[0-9]+)?)\/([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)\/-\/merge_requests\/([1-9][0-9]*)$/.exec(
      value,
    );

  if (
    !match ||
    match[2]!.split("/").some((part) => part === "." || part === "..") ||
    !Number.isSafeInteger(Number(match[3]))
  )
    throw new ReviewInputError("Invalid GitLab merge request URL.");
  const parsed = new URL(value);

  return {
    host: parsed.host,
    projectPath: match[2]!,
    iid: Number(match[3]),
    url: parsed.href,
  };
}

export type GitLabRun = (
  file: string,
  args: string[],
  options: { cwd?: string; timeoutMs: number; input?: string },
) => Promise<string>;

export const runGitLabCommand: GitLabRun = (file, args, options) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GLAB_PROMPT_DISABLED: "1",
          GIT_SSH_COMMAND:
            process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes",
        },
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);

          return;
        }

        const status = /HTTP (\d{3})/.exec(String(stderr));
        // Never forward arguments, token-bearing stdout, or subprocess diagnostics.
        reject(
          new GitLabRequestError(
            status ? Number(status[1]) : undefined,
            error.code === "ENOENT",
          ),
        );
      },
    );

    child.stdin?.end(options.input);
  });

export class GitLabRequestError extends ReviewInputError {
  readonly uncertain: boolean;
  constructor(
    readonly httpStatus?: number,
    missing = false,
  ) {
    super(
      missing
        ? "Install glab and Git on Chalk's PATH, then retry."
        : httpStatus === 401 || httpStatus === 403
          ? "GitLab authentication or permission failed. Check glab auth status for this host and reconnect with an account that can access the MR."
          : "GitLab could not confirm the request. Check the MR and your connection before retrying.",
      409,
    );
    this.uncertain =
      !missing && (httpStatus === undefined || httpStatus >= 500);
  }
}

const remoteRefsSchema = z.object({
  base_sha: z.string().regex(/^[a-f0-9]{40}$/i),
  start_sha: z.string().regex(/^[a-f0-9]{40}$/i),
  head_sha: z.string().regex(/^[a-f0-9]{40}$/i),
});

const metadataSchema = z.object({
  iid: z.number().int().positive(),
  project_id: z.number().int().positive(),
  title: z.string(),
  diff_refs: remoteRefsSchema,
});

const projectSchema = z.object({
  id: z.number().int().positive(),
  path_with_namespace: z.string(),
  http_url_to_repo: z.string(),
  ssh_url_to_repo: z.string(),
});

const positionSchema = remoteRefsSchema.extend({
  old_path: z.string(),
  new_path: z.string(),
  old_line: z.number().int().positive().nullable().optional(),
  new_line: z.number().int().positive().nullable().optional(),
  position_type: z.string().optional(),
  line_range: z
    .object({
      start: z.object({
        type: z.enum(["new", "old"]),
        old_line: z.number().int().positive().nullable().optional(),
        new_line: z.number().int().positive().nullable().optional(),
      }),
      end: z.object({
        type: z.enum(["new", "old"]),
        old_line: z.number().int().positive().nullable().optional(),
        new_line: z.number().int().positive().nullable().optional(),
      }),
    })
    .nullable()
    .optional(),
});

const noteSchema = z.object({
  id: z.number().int().positive(),
  body: z.string(),
  author: gitLabAccountSchema,
  created_at: z.string(),
  system: z.boolean().optional(),
  resolved: z.boolean().optional(),
  resolvable: z.boolean().optional(),
  position: positionSchema.nullable().optional(),
});

const discussionSchema = z.object({
  id: z.string(),
  notes: z.array(noteSchema),
});

export class GitLabClient {
  constructor(
    readonly host: string,
    readonly run: GitLabRun = runGitLabCommand,
  ) {}

  async request(
    endpoint: string,
    method = "GET",
    input?: Record<string, JsonValue>,
  ) {
    const args = ["api", "--hostname", this.host, "--method", method, endpoint];

    if (input)
      args.push("--input", "-", "--header", "Content-Type: application/json");

    const text = await this.run("glab", args, {
      timeoutMs: 30_000,
      input: input ? JSON.stringify(input) : undefined,
    });

    try {
      return JSON.parse(text);
    } catch {
      throw new GitLabRequestError(undefined);
    }
  }

  async account() {
    return gitLabAccountSchema.parse(await this.request("user"));
  }

  async metadata(project: string | number, iid: number) {
    const mr = metadataSchema.parse(
      await this.request(
        `projects/${encodeURIComponent(project)}/merge_requests/${iid}`,
      ),
    );

    return {
      title: mr.title,
      projectId: mr.project_id,
      iid: mr.iid,
      refs: {
        baseSha: mr.diff_refs.base_sha,
        startSha: mr.diff_refs.start_sha,
        headSha: mr.diff_refs.head_sha,
      },
    };
  }

  async project(id: number) {
    return projectSchema.parse(await this.request(`projects/${id}`));
  }

  async discussions(
    projectId: number,
    iid: number,
  ): Promise<GitLabDiscussion[]> {
    const result: GitLabDiscussion[] = [];

    for (let page = 1; ; page++) {
      const discussions = z
        .array(discussionSchema)
        .parse(
          await this.request(
            `projects/${projectId}/merge_requests/${iid}/discussions?per_page=100&page=${page}`,
          ),
        );

      for (const discussion of discussions) {
        const notes = discussion.notes.filter((note) => !note.system);

        if (!notes.length) continue;
        const remote = notes.find((note) => note.position)?.position;

        const side = remote?.line_range
          ? remote.line_range.end.type === "new"
            ? "head"
            : "base"
          : remote?.new_line
            ? "head"
            : "base";

        const line = remote?.new_line ?? remote?.old_line;
        result.push({
          id: discussion.id,
          resolved:
            notes
              .filter((note) => note.resolvable)
              .every((note) => note.resolved) &&
            notes.some((note) => note.resolvable),
          resolvable: notes.some((note) => note.resolvable),
          position:
            remote &&
            line &&
            (!remote.position_type || remote.position_type === "text")
              ? {
                  baseSha: remote.base_sha,
                  startSha: remote.start_sha,
                  headSha: remote.head_sha,
                  oldPath: remote.old_path,
                  newPath: remote.new_path,
                  side,
                  from:
                    (side === "head"
                      ? remote.line_range?.start.new_line
                      : remote.line_range?.start.old_line) ?? line,
                  to:
                    (side === "head"
                      ? remote.line_range?.end.new_line
                      : remote.line_range?.end.old_line) ?? line,
                }
              : undefined,
          comments: notes.map((note) => ({
            id: note.id,
            body: note.body,
            author: note.author,
            createdAt: note.created_at,
          })),
        });
      }

      if (discussions.length < 100) return result;
    }
  }

  async post(
    projectId: number,
    iid: number,
    body: string,
    discussionId?: string,
    position?: GitLabPosition,
  ) {
    const route = `projects/${projectId}/merge_requests/${iid}/discussions`;

    const input = {
      body,
      ...(position && { position: remotePosition(position) }),
    };

    const response = await this.request(
      discussionId
        ? `${route}/${encodeURIComponent(discussionId)}/notes`
        : route,
      "POST",
      input,
    );

    const parsed = (discussionId ? noteSchema : discussionSchema).safeParse(
      response,
    );

    if (!parsed.success) throw new GitLabRequestError(undefined);
    const note = "notes" in parsed.data ? parsed.data.notes[0] : parsed.data;

    if (!note) throw new GitLabRequestError(undefined);

    return note.id;
  }

  async resolve(projectId: number, iid: number, discussionId: string) {
    const result = discussionSchema.parse(
      await this.request(
        `projects/${projectId}/merge_requests/${iid}/discussions/${encodeURIComponent(discussionId)}`,
        "PUT",
        { resolved: true },
      ),
    );

    if (
      !result.notes.some((note) => note.resolvable) ||
      result.notes.some((note) => note.resolvable && !note.resolved)
    )
      throw new ReviewInputError(
        "GitLab did not confirm discussion resolution.",
        409,
      );
  }
}

function remotePosition(position: GitLabPosition) {
  const file = position.side === "head" ? position.newPath : position.oldPath;
  const hash = createHash("sha1").update(file).digest("hex");

  const entry = (number: number, opposite: number | undefined) => ({
    type: position.side === "head" ? "new" : "old",
    line_code: `${hash}_${position.side === "base" ? number : (opposite ?? 0)}_${position.side === "head" ? number : (opposite ?? 0)}`,
    ...(position.side === "head"
      ? { new_line: number, ...(opposite && { old_line: opposite }) }
      : { old_line: number, ...(opposite && { new_line: opposite }) }),
  });

  return {
    position_type: "text",
    base_sha: position.baseSha,
    start_sha: position.startSha,
    head_sha: position.headSha,
    old_path: position.oldPath,
    new_path: position.newPath,
    ...(position.side === "head"
      ? {
          new_line: position.to,
          ...(position.oppositeTo && { old_line: position.oppositeTo }),
        }
      : {
          old_line: position.to,
          ...(position.oppositeTo && { new_line: position.oppositeTo }),
        }),
    ...(position.from !== position.to && {
      line_range: {
        start: entry(position.from, position.oppositeFrom),
        end: entry(position.to, position.oppositeTo),
      },
    }),
  };
}

/** Exact surrounding context must have one match; repeated/rewritten code stays unmapped. */
export function remapLineRange(
  before: string,
  after: string,
  from: number,
  to: number,
): { from: number; to: number } | null {
  const old = before.split("\n");
  const next = after.split("\n");

  if (from < 1 || to < from || to > old.length) return null;

  if (before === after) return { from, to };
  const start = Math.max(0, from - 4);
  const end = Math.min(old.length, to + 3);
  const context = old.slice(start, end);
  let found: number | undefined;

  for (let index = 0; index <= next.length - context.length; index++) {
    if (!context.every((value, offset) => next[index + offset] === value))
      continue;

    if (found !== undefined) return null;
    found = index;
  }

  return found === undefined
    ? null
    : { from: found + from - start, to: found + to - start };
}
