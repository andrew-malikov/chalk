import "prosekit/basic/style.css";
import { MarkdownContent } from "@canvas/documents/agent-markdown";
import { cn } from "@canvas/lib/utils";
import { Button, IconButton } from "@canvas/ui/button";
import { useMachine } from "@xstate/react";
import {
  BoldIcon,
  CodeIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  TextQuoteIcon,
} from "lucide-react";
import {
  type Editor,
  Priority,
  createEditor,
  defineBaseCommands,
  defineBaseKeymap,
  defineHistory,
  defineKeymap,
  defineNodeSpec,
  union,
  withPriority,
} from "prosekit/core";
import { definePlaceholder } from "prosekit/extensions/placeholder";
import { defineReadonly } from "prosekit/extensions/readonly";
import { defineText } from "prosekit/extensions/text";
import { TextSelection } from "prosekit/pm/state";
import { ProseKit, useDocChange, useExtension } from "prosekit/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { setup } from "xstate";

import {
  type MarkdownEdit,
  code,
  continueList,
  link,
  prefixLines,
  wrap,
} from "./markdown-edits";

/** First component on XState; the Write/Preview tab is its only local state. */
const commentEditorMachine = setup({
  types: {
    // SAFETY: XState reads `types` only for type inference; it is never used at runtime.
    events: {} as { type: "write" } | { type: "preview" },
  },
}).createMachine({
  id: "commentEditor",
  initial: "write",
  states: {
    write: { on: { preview: "preview" } },
    preview: { on: { write: "write" } },
  },
});

/** The document is one block of raw Markdown, so Enter and paste keep text exactly as typed. */
const defineMarkdownSource = (placeholder: string) =>
  union(
    defineNodeSpec({ name: "doc", topNode: true, content: "source" }),
    defineNodeSpec({
      name: "source",
      content: "text*",
      code: true,
      marks: "",
      parseDOM: [{ tag: "div", preserveWhitespace: "full" }],
      toDOM: () => ["div", 0],
    }),
    defineText(),
    defineHistory(),
    defineBaseKeymap(),
    defineBaseCommands(),
    definePlaceholder({
      placeholder,
      // The default strategy hides placeholders in code blocks, which this is.
      strategy: (state) => state.doc.textContent === "",
    }),
  );

const sourceDoc = (text: string) => ({
  type: "doc",
  content: [{ type: "source", content: text ? [{ type: "text", text }] : [] }],
});

type Format = (text: string, from: number, to: number) => MarkdownEdit | null;

/** Applies a Markdown edit to the selection; text offsets sit one past document positions. */
function format(editor: Editor, edit: Format) {
  const { state } = editor.view;
  const { from, to } = state.selection;
  const change = edit(state.doc.textContent, from - 1, to - 1);

  if (!change) return false;
  const tr = state.tr.insertText(change.insert, change.from + 1, change.to + 1);

  editor.view.dispatch(
    tr.setSelection(
      TextSelection.create(tr.doc, change.select[0] + 1, change.select[1] + 1),
    ),
  );
  editor.focus();

  return true;
}

const toolbar: {
  label: string;
  key?: string;
  icon: typeof BoldIcon;
  edit: Format;
}[] = [
  {
    label: "Heading",
    icon: HeadingIcon,
    edit: (text, from, to) =>
      prefixLines(text, from, to, () => "### ", /^#{1,6} /),
  },
  {
    label: "Bold",
    key: "Mod-b",
    icon: BoldIcon,
    edit: (text, from, to) => wrap(text, from, to, "**"),
  },
  {
    label: "Italic",
    key: "Mod-i",
    icon: ItalicIcon,
    edit: (text, from, to) => wrap(text, from, to, "_"),
  },
  {
    label: "Quote",
    icon: TextQuoteIcon,
    edit: (text, from, to) => prefixLines(text, from, to, () => "> ", /^> /),
  },
  { label: "Code", key: "Mod-e", icon: CodeIcon, edit: code },
  { label: "Link", key: "Mod-k", icon: LinkIcon, edit: link },
  {
    label: "Bulleted list",
    icon: ListIcon,
    edit: (text, from, to) => prefixLines(text, from, to, () => "- ", /^- /),
  },
  {
    label: "Numbered list",
    icon: ListOrderedIcon,
    edit: (text, from, to) =>
      prefixLines(text, from, to, (i) => `${i + 1}. `, /^\d+\. /),
  },
  {
    label: "Task list",
    icon: ListTodoIcon,
    edit: (text, from, to) =>
      prefixLines(text, from, to, () => "- [ ] ", /^- \[[ xX]\] /),
  },
];

/** GitLab Markdown comment editor: Write edits the raw Markdown, Preview renders it. */
export function CommentEditor({
  value,
  onChange,
  onSubmit,
  disabled,
  focused,
  placeholder,
  labelledBy,
  inline,
}: {
  /** Followed when it changes elsewhere, e.g. the same draft open in two places. */
  value: string;
  onChange(markdown: string): void;
  onSubmit(): void;
  disabled: boolean;
  focused: boolean;
  placeholder: string;
  labelledBy: string;
  inline?: boolean;
}) {
  const [editor] = useState(() =>
    createEditor({
      extension: defineMarkdownSource(placeholder),
      defaultContent: sourceDoc(value),
    }),
  );

  const [snapshot, send] = useMachine(commentEditorMachine);
  const previewing = snapshot.matches("preview");

  const submit = useRef(onSubmit);
  submit.current = onSubmit;

  // Registered before focusing and other extensions; registered after them it missed edits under jsdom.
  useDocChange(
    (doc) => {
      if (doc.textContent !== value) onChange(doc.textContent);
    },
    { editor },
  );
  useEffect(() => {
    const { state } = editor.view;

    if (state.doc.textContent === value) return;
    // Out of undo history: undo only reverts this editor's own typing.
    editor.view.dispatch(
      state.tr
        .insertText(value, 1, state.doc.content.size - 1)
        .setMeta("addToHistory", false),
    );
  }, [editor, value]);
  useEffect(() => {
    if (focused) editor.focus();
  }, [editor, focused]);
  // Extensions are memoized: a new one re-renders the editor, looping forever.
  useExtension(
    useMemo(() => (disabled ? defineReadonly() : null), [disabled]),
    { editor },
  );
  useExtension(
    useMemo(
      () =>
        withPriority(
          defineKeymap({
            Enter: () => format(editor, continueList),
            // A plain line break, without continuing a list.
            "Shift-Enter": () =>
              format(editor, (_, from, to) => ({
                from,
                to,
                insert: "\n",
                select: [from + 1, from + 1],
              })),
            "Mod-Enter": () => (submit.current(), true),
            ...Object.fromEntries(
              toolbar.flatMap(({ key, edit }) =>
                key ? [[key, () => format(editor, edit)]] : [],
              ),
            ),
          }),
          Priority.high,
        ),
      [editor],
    ),
    { editor },
  );

  const box = cn(
    "tw:overflow-y-auto tw:p-2 tw:text-[13px] tw:leading-normal tw:text-[var(--ink)] tw:font-[family-name:var(--chrome-font)] tw:outline-none",
    inline ? "tw:min-h-[72px]" : "tw:min-h-[90px]",
    "tw:max-h-[480px]",
  );

  return (
    <ProseKit editor={editor}>
      <div className="tw:flex tw:min-w-0 tw:flex-col tw:rounded-[4px] tw:border tw:border-[var(--chrome-border)] tw:bg-[var(--bg)] tw:focus-within:border-[var(--ink-faint)]">
        <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-1 tw:border-b tw:border-[var(--chrome-border)] tw:p-1">
          <div className="tw:flex tw:gap-0.5">
            {(["write", "preview"] as const).map((tab) => (
              <Button
                key={tab}
                variant="ghost"
                aria-pressed={snapshot.matches(tab)}
                className={
                  snapshot.matches(tab)
                    ? "tw:bg-[var(--chrome-hover-bg)] tw:text-[var(--ink)]"
                    : "tw:text-[var(--ink-faint)]"
                }
                onClick={() => send({ type: tab })}
              >
                {tab === "write" ? "Write" : "Preview"}
              </Button>
            ))}
          </div>
          {!previewing && (
            <div
              role="toolbar"
              aria-label="Formatting"
              className="tw:flex tw:flex-wrap tw:gap-0.5"
            >
              {toolbar.map(({ label, icon: Icon, edit }) => (
                <IconButton
                  key={label}
                  aria-label={label}
                  title={label}
                  disabled={disabled}
                  // Keep the editor's selection while clicking.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format(editor, edit)}
                >
                  <Icon />
                </IconButton>
              ))}
            </div>
          )}
        </div>
        <div
          ref={editor.mount}
          role="textbox"
          aria-multiline
          aria-labelledby={labelledBy}
          aria-disabled={disabled || undefined}
          className={cn(box, previewing && "tw:hidden")}
        />
        {previewing && (
          <div className={box}>
            {value.trim() ? (
              <MarkdownContent source={value} />
            ) : (
              <p className="tw:m-0 tw:text-[var(--ink-faint)]">
                Nothing to preview
              </p>
            )}
          </div>
        )}
      </div>
    </ProseKit>
  );
}
