/** A replacement of `text[from, to)` and the selection to leave afterwards. */
export interface MarkdownEdit {
  from: number;
  to: number;
  insert: string;
  select: [number, number];
}

const lineStart = (text: string, at: number) =>
  text.lastIndexOf("\n", at - 1) + 1;

const lineEnd = (text: string, at: number) => {
  const end = text.indexOf("\n", at);

  return end === -1 ? text.length : end;
};

/** Wraps the selection in markers, or unwraps it where it is already wrapped. */
export function wrap(
  text: string,
  from: number,
  to: number,
  open: string,
  close = open,
): MarkdownEdit {
  const before = from - open.length;

  if (
    text.slice(before, from) === open &&
    text.slice(to, to + close.length) === close
  )
    return {
      from: before,
      to: to + close.length,
      insert: text.slice(from, to),
      select: [before, to - open.length],
    };

  return {
    from,
    to,
    insert: open + text.slice(from, to) + close,
    select: [from + open.length, to + open.length],
  };
}

/** Inline code within a line, a fenced block across lines. */
export const code = (text: string, from: number, to: number) =>
  text.slice(from, to).includes("\n")
    ? wrap(text, from, to, "```\n", "\n```")
    : wrap(text, from, to, "`");

/** `[selection](url)` with `url` selected for typing; a selected URL becomes the target. */
export function link(text: string, from: number, to: number): MarkdownEdit {
  const selected = text.slice(from, to);

  if (/^https?:\/\/\S+$/.test(selected))
    return {
      from,
      to,
      insert: `[](${selected})`,
      select: [from + 1, from + 1],
    };

  const urlAt = from + selected.length + 3;

  return {
    from,
    to,
    insert: `[${selected}](url)`,
    select: [urlAt, urlAt + 3],
  };
}

/** Prefixes every selected line, or strips the prefix where every line already has it. */
export function prefixLines(
  text: string,
  from: number,
  to: number,
  prefix: (index: number) => string,
  existing: RegExp,
): MarkdownEdit {
  const start = lineStart(text, from);
  const lines = text.slice(start, lineEnd(text, to)).split("\n");
  const strip = lines.every((line) => existing.test(line));

  const insert = lines
    .map((line, index) =>
      strip ? line.replace(existing, "") : prefix(index) + line,
    )
    .join("\n");

  const end = start + insert.length;

  return {
    from: start,
    to: lineEnd(text, to),
    insert,
    select: from === to ? [end, end] : [start, end],
  };
}

const listItem = /^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)\. )/;

/** Enter in a list item starts the next item; on an empty item it ends the list. */
export function continueList(
  text: string,
  from: number,
  to: number,
): MarkdownEdit | null {
  if (from !== to) return null;

  const start = lineStart(text, from);
  const match = listItem.exec(text.slice(start, from));

  if (!match) return null;

  if (text.slice(start, lineEnd(text, from)) === match[0])
    return { from: start, to: from, insert: "", select: [start, start] };

  const marker = match[3]
    ? `${Number(match[3]) + 1}. `
    : match[2]!.replace(/\[[xX]\]/, "[ ]");

  const insert = `\n${match[1]}${marker}`;

  return {
    from,
    to,
    insert,
    select: [from + insert.length, from + insert.length],
  };
}
