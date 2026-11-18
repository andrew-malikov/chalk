import { createHash } from "node:crypto";

import {
  type GitLabDiscussion,
  type GitLabPosition,
  gitLabAccountSchema,
  gitLabRefsSchema,
} from "@chalk/review-contracts";
import {
  type DiscussionNotePositionOptions,
  GitbeakerRequestError,
  Gitlab,
} from "@gitbeaker/rest";
import { gitLabToken } from "./gitlab-token.js";
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

export class GitLabRequestError extends ReviewInputError {
  readonly uncertain: boolean;
  constructor(
    readonly httpStatus?: number,
    missing = false,
  ) {
    super(
      missing
        ? "Install Git on Chalk's PATH, then retry."
        : httpStatus === 401 || httpStatus === 403
          ? "GitLab authentication or permission failed. Check the GitLab token for this host in Settings."
          : "GitLab could not confirm the request. Check the MR and your connection before retrying.",
      409,
    );
    this.uncertain =
      !missing && (httpStatus === undefined || httpStatus >= 500);
  }
}

/** Desktop Settings keeps tokens per host in preferences.json, so a token never reaches another host. */
export async function gitLabGitAuth(host: string): Promise<NodeJS.ProcessEnv> {
  const token = await gitLabToken(host);

  return token
    ? {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: `http.https://${host}/.extraHeader`,
        GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`oauth2:${token}`).toString("base64")}`,
      }
    : {};
}

export class GitLabClient {
  private readonly api: Gitlab;
  constructor(host: string, token?: string) {
    this.api = new Gitlab({
      host: `https://${host}`,
      queryTimeout: 30_000,
      ...(token ? { token } : {}),
    });
  }

  private async call<T>(request: (api: Gitlab) => Promise<T>) {
    try {
      return await request(this.api);
    } catch (error) {
      // Never forward request details: the token rides in its headers.
      throw new GitLabRequestError(
        error instanceof GitbeakerRequestError
          ? error.cause?.response.status
          : undefined,
      );
    }
  }

  async account() {
    return gitLabAccountSchema.parse(
      await this.call((api) => api.Users.showCurrentUser()),
    );
  }

  async metadata(project: string | number, iid: number) {
    const mr = await this.call((api) => api.MergeRequests.show(project, iid));

    return {
      title: mr.title,
      projectId: mr.project_id,
      iid: mr.iid,
      // SHAs flow into git arguments.
      refs: gitLabRefsSchema.parse({
        baseSha: mr.diff_refs?.base_sha,
        startSha: mr.diff_refs?.start_sha,
        headSha: mr.diff_refs?.head_sha,
      }),
    };
  }

  async project(id: number) {
    return this.call((api) => api.Projects.show(id));
  }

  async discussions(
    projectId: number,
    iid: number,
  ): Promise<GitLabDiscussion[]> {
    const discussions = await this.call((api) =>
      api.MergeRequestDiscussions.all(projectId, iid, { perPage: 100 }),
    );

    const result: GitLabDiscussion[] = [];

    for (const discussion of discussions) {
      const notes = (discussion.notes ?? []).filter((note) => !note.system);

      if (!notes.length) continue;
      const remote = notes.find((note) => note.position)?.position;
      const text = remote?.position_type === "text" ? remote : undefined;
      // gitbeaker types diff lines as strings; GitLab sends numbers.
      const newLine = Number(text?.new_line) || undefined;
      const line = newLine ?? (Number(text?.old_line) || undefined);

      const side = text?.line_range
        ? text.line_range.end?.type === "new"
          ? "head"
          : "base"
        : newLine
          ? "head"
          : "base";

      result.push({
        id: discussion.id,
        resolved:
          notes
            .filter((note) => note.resolvable)
            .every((note) => note.resolved === true) &&
          notes.some((note) => note.resolvable),
        resolvable: notes.some((note) => note.resolvable),
        position:
          text && line && text.old_path && text.new_path
            ? {
                baseSha: text.base_sha,
                startSha: text.start_sha,
                headSha: text.head_sha,
                oldPath: text.old_path,
                newPath: text.new_path,
                side,
                from:
                  (side === "head"
                    ? text.line_range?.start?.new_line
                    : text.line_range?.start?.old_line) ?? line,
                to:
                  (side === "head"
                    ? text.line_range?.end?.new_line
                    : text.line_range?.end?.old_line) ?? line,
              }
            : undefined,
        comments: notes.map((note) => ({
          id: note.id,
          body: note.body,
          author: gitLabAccountSchema.parse(note.author),
          createdAt: note.created_at,
        })),
      });
    }

    return result;
  }

  async post(
    projectId: number,
    iid: number,
    body: string,
    discussionId?: string,
    position?: GitLabPosition,
  ) {
    const note = await this.call(async (api) =>
      discussionId
        ? api.MergeRequestDiscussions.addNote(
            projectId,
            iid,
            discussionId,
            body,
          )
        : (
            await api.MergeRequestDiscussions.create(
              projectId,
              iid,
              body,
              position && { position: remotePosition(position) },
            )
          ).notes?.[0],
    );

    if (!note) throw new GitLabRequestError(undefined);

    return note.id;
  }

  async resolve(projectId: number, iid: number, discussionId: string) {
    const notes =
      (
        await this.call((api) =>
          api.MergeRequestDiscussions.resolve(
            projectId,
            iid,
            discussionId,
            true,
          ),
        )
      ).notes ?? [];

    if (
      !notes.some((note) => note.resolvable) ||
      notes.some((note) => note.resolvable && note.resolved !== true)
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
  const type = position.side === "head" ? ("new" as const) : ("old" as const);

  const entry = (number: number, opposite: number | undefined) => ({
    type,
    lineCode: `${hash}_${position.side === "base" ? number : (opposite ?? 0)}_${position.side === "head" ? number : (opposite ?? 0)}`,
    ...(position.side === "head"
      ? { newLine: number, ...(opposite && { oldLine: opposite }) }
      : { oldLine: number, ...(opposite && { newLine: opposite }) }),
  });

  // GitLab coerces these; gitbeaker types them as strings.
  const to = String(position.to);
  const oppositeTo = position.oppositeTo && String(position.oppositeTo);

  return {
    positionType: "text",
    baseSha: position.baseSha,
    startSha: position.startSha,
    headSha: position.headSha,
    oldPath: position.oldPath,
    newPath: position.newPath,
    ...(position.side === "head"
      ? { newLine: to, ...(oppositeTo && { oldLine: oppositeTo }) }
      : { oldLine: to, ...(oppositeTo && { newLine: oppositeTo }) }),
    ...(position.from !== position.to && {
      lineRange: {
        start: entry(position.from, position.oppositeFrom),
        end: entry(position.to, position.oppositeTo),
      },
    }),
  } satisfies DiscussionNotePositionOptions;
}

/** Exact surrounding context must have one match; repeated/rewritten code stays unmapped. */
/** The selected lines with up to three lines around them, and the file's digest, to find them again after the source changes. */
export function lineContext(text: string, from: number, to: number) {
  const lines = text.split("\n");

  if (from < 1 || to < from || to > lines.length) return null;
  const start = Math.max(0, from - 4);

  return {
    start,
    lines: lines.slice(start, Math.min(lines.length, to + 3)),
    digest: createHash("sha256").update(text).digest("hex"),
  };
}

/** Where the context is now: in place in an unchanged file, else its only occurrence; null when it changed or repeats. */
export function findLineRange(
  context: { start: number; lines: string[]; digest: string },
  text: string,
  from: number,
  to: number,
): { from: number; to: number } | null {
  if (createHash("sha256").update(text).digest("hex") === context.digest)
    return { from, to };
  const next = text.split("\n");
  let found: number | undefined;

  for (let index = 0; index <= next.length - context.lines.length; index++) {
    if (!context.lines.every((value, offset) => next[index + offset] === value))
      continue;

    if (found !== undefined) return null;
    found = index;
  }

  return found === undefined
    ? null
    : { from: found + from - context.start, to: found + to - context.start };
}

export function remapLineRange(
  before: string,
  after: string,
  from: number,
  to: number,
): { from: number; to: number } | null {
  const context = lineContext(before, from, to);

  return context && findLineRange(context, after, from, to);
}
