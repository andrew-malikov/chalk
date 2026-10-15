import { expect, test } from "vitest";

import {
  type MarkdownEdit,
  code,
  continueList,
  link,
  prefixLines,
  wrap,
} from "./markdown-edits";

/** Applies an edit, marking the resulting selection with `[` `]`, or `|` for a cursor. */
const apply = (text: string, edit: MarkdownEdit | null) => {
  if (!edit) return null;
  const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  const [from, to] = edit.select;

  return from === to
    ? `${next.slice(0, from)}|${next.slice(from)}`
    : `${next.slice(0, from)}[${next.slice(from, to)}]${next.slice(to)}`;
};

test("wrapping toggles markers around the selection", () => {
  expect(apply("say hi", wrap("say hi", 4, 6, "**"))).toBe("say **[hi]**");
  expect(apply("say **hi**", wrap("say **hi**", 6, 8, "**"))).toBe("say [hi]");
  expect(apply("", wrap("", 0, 0, "_"))).toBe("_|_");
});

test("code is inline within a line and fenced across lines", () => {
  expect(apply("a b", code("a b", 2, 3))).toBe("a `[b]`");
  expect(apply("a\nb", code("a\nb", 0, 3))).toBe("```\n[a\nb]\n```");
});

test("a link selects its URL placeholder, or adopts a selected URL", () => {
  expect(apply("docs", link("docs", 0, 4))).toBe("[docs]([url])");
  expect(apply("https://x.y", link("https://x.y", 0, 11))).toBe(
    "[|](https://x.y)",
  );
});

test("line prefixes cover every selected line and toggle off", () => {
  const numbered = (i: number) => `${i + 1}. `;

  expect(
    apply("a\nb\nc", prefixLines("a\nb\nc", 0, 3, numbered, /^\d+\. /)),
  ).toBe("[1. a\n2. b]\nc");
  expect(
    apply(
      "x\n> q",
      prefixLines("x\n> q", 4, 4, () => "> ", /^> /),
    ),
  ).toBe("x\nq|");
});

test("enter continues lists and ends them on an empty item", () => {
  expect(apply("- [x] done", continueList("- [x] done", 10, 10))).toBe(
    "- [x] done\n- [ ] |",
  );
  expect(apply("  9. nine", continueList("  9. nine", 9, 9))).toBe(
    "  9. nine\n  10. |",
  );
  expect(apply("- a\n- ", continueList("- a\n- ", 6, 6))).toBe("- a\n|");
  expect(continueList("plain", 5, 5)).toBeNull();
});
