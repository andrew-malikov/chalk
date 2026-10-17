import { DiagramHeader } from "@canvas/diagrams/diagram-header";
import { drawStyles } from "@canvas/drawing/draw-styles";
import { cn } from "@canvas/lib/utils";
import { CopyButton } from "@canvas/ui/copy-text";
import {
  type ShjLanguage,
  type ShjToken,
  tokenize,
} from "@speed-highlight/core";
import type { ClassValue } from "clsx";
import {
  type ComponentProps,
  type ReactElement,
  useEffect,
  useState,
} from "react";

export interface RenderedCodeBlockProps extends ComponentProps<"pre"> {
  code: string;
  language?: string | null;
  /** Header title; a fenced markdown block has none. */
  caption?: string;
  /** Ghost line numbers in a sticky gutter; off for fenced markdown. */
  lineNumbers?: boolean;
  codeAttributes?: Record<string, string>;
}

/** A code figure: the same header as the other figures (language badge,
 * caption, line count, copy), then the highlighted code. */
export function RenderedCodeBlock({
  code,
  language,
  caption,
  lineNumbers = false,
  codeAttributes,
  className,
  ...props
}: RenderedCodeBlockProps): ReactElement {
  const normalizedLanguage = normalizeMarkdownCodeLanguage(language ?? "");

  const [highlightedTokens, setHighlightedTokens] = useState<
    HighlightedToken[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    if (!normalizedLanguage) {
      setHighlightedTokens(null);

      return;
    }

    const tokens: HighlightedToken[] = [];
    tokenize(code, normalizedLanguage, (text, token) => {
      tokens.push({ text, token });
    })
      .then(() => {
        if (!cancelled) setHighlightedTokens(tokens);
      })
      .catch(() => {
        if (!cancelled) setHighlightedTokens(null);
      });

    return () => {
      cancelled = true;
    };
  }, [code, normalizedLanguage]);

  const displayLanguage = normalizedLanguage ?? language?.trim() ?? undefined;
  const lineCount = countLines(code);

  return (
    <figure
      {...(className
        ? { className: cn(className, styles.block, drawStyles.blockChild) }
        : { className: cn(styles.block, drawStyles.blockChild) })}
      data-language={displayLanguage}
    >
      <DiagramHeader
        kind={displayLanguage || "code"}
        title={caption}
        meta={`${lineCount} ${lineCount === 1 ? "line" : "lines"}`}
        className={styles.header}
        metaClassName={styles.meta}
        action={
          <CopyButton
            text={code}
            label="Copy"
            className={styles.copy}
            iconClassName={styles.copyIcon}
          />
        }
      />
      <pre {...props} className={styles.body}>
        {lineNumbers && (
          <span aria-hidden="true" className={styles.gutter}>
            {Array.from({ length: lineCount }, (_, index) => index + 1).join(
              "\n",
            )}
          </span>
        )}
        <code
          {...codeAttributes}
          className={styles.code}
          data-review-copy-prose
        >
          {normalizedLanguage && highlightedTokens
            ? highlightedTokens.map((item, index) =>
                item.token ? (
                  <span
                    className={cn(syntaxByToken.get(item.token))}
                    key={index}
                  >
                    {item.text}
                  </span>
                ) : (
                  item.text
                ),
              )
            : code}
        </code>
      </pre>
    </figure>
  );
}

/** A trailing newline ends the last line rather than starting an empty one. */
function countLines(code: string): number {
  const lines = code.split("\n");

  return lines.length > 1 && lines.at(-1) === ""
    ? lines.length - 1
    : lines.length;
}

interface HighlightedToken {
  text: string;
  token: ShjToken | undefined;
}

function normalizeMarkdownCodeLanguage(language: string): ShjLanguage | null {
  const normalized = language.trim().toLowerCase();

  switch (normalized) {
    case "asm":
    case "bash":
    case "bf":
    case "c":
    case "css":
    case "csv":
    case "diff":
    case "docker":
    case "git":
    case "go":
    case "html":
    case "http":
    case "ini":
    case "java":
    case "js":
    case "jsdoc":
    case "json":
    case "leanpub-md":
    case "log":
    case "lua":
    case "make":
    case "md":
    case "pl":
    case "plain":
    case "py":
    case "regex":
    case "rs":
    case "sql":
    case "todo":
    case "toml":
    case "ts":
    case "uri":
    case "xml":
    case "yaml":
      return normalized;
    case "javascript":
    case "jsx":
      return "js";
    case "typescript":
    case "tsx":
      return "ts";
    case "python":
      return "py";
    case "rust":
      return "rs";
    case "markdown":
    case "mdx":
      return "md";
    case "shell":
    case "sh":
    case "zsh":
      return "bash";
    case "yml":
      return "yaml";
    case "text":
      return "plain";
    default:
      return null;
  }
}

// The same figure as a diagram: hairline frame, tray header with the language
// as its kind, the caption as its title, a line count and an icon-only copy
// button; then the code, scrolling sideways, never wrapping.
const styles = {
  block:
    "tw:min-w-0 tw:max-w-full tw:[&:is(.canvas-document:is(*)_*):is([data-review-node-id]_>_*)]:max-w-[calc(100cqi_-_2_*_var(--review-document-padding-inline))] tw:[&:is(.canvas-document:is(*)_*):is([data-review-node-id]_>_*)]:w-[min(100%,_var(--review-block-max-width))] tw:[&:is(.canvas-document:is(*)_*):is([data-review-node-id]_>_*)]:mx-[auto] tw:my-[24px] tw:overflow-hidden tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[8px] tw:bg-[color:var(--surface)]",
  header: "tw:pr-[8px]",
  meta: "tw:ml-0",
  copy: "tw:ml-[auto] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule-soft)] tw:bg-[color:var(--surface)] tw:[&:hover]:bg-[color:var(--well)] tw:[&:is([data-copied])]:bg-[color:var(--well)]",
  copyIcon: "tw:size-[14px] tw:stroke-[1.5px]",
  body: "tw:flex tw:m-0 tw:overflow-x-auto tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-mono)] tw:text-[length:13px] tw:font-normal tw:leading-[20px] tw:text-left",
  code: "tw:block tw:flex-[1_0_auto] tw:p-[12px_14px] tw:rounded-none tw:bg-[color:var(--transparent)] tw:text-[color:inherit] tw:font-[family-name:inherit] tw:text-[length:inherit] tw:font-[number:inherit] tw:leading-[inherit] tw:[font-style:inherit] tw:whitespace-pre tw:[tab-size:4]",
  gutter:
    "tw:sticky tw:left-0 tw:flex-[0_0_auto] tw:min-w-[50px] tw:p-[12px_14px] tw:bg-[color:var(--surface)] tw:text-[color:var(--ghost)] tw:text-right tw:whitespace-pre tw:select-none",
};

// Syntax tokens (@speed-highlight/core). The Chalk palette: ink at three
// strengths, the marker for keywords, two more blues for types and functions,
// one warm pencil for strings and one plum for numbers. Comments are quiet and
// italic. Diff green and red are reserved for the diff language. The editor
// themes carry the same values.
const syntaxStyles = {
  kwd: "tw:text-[color:var(--accent)]",
  type: "tw:text-[color:var(--syntax-type)]",
  class: "tw:text-[color:var(--syntax-type)] tw:font-medium",
  func: "tw:text-[color:var(--syntax-function)]",
  section: "tw:text-[color:var(--syntax-function)] tw:font-semibold",
  var: "tw:text-[color:var(--ink)]",
  str: "tw:text-[color:var(--syntax-string)]",
  num: "tw:text-[color:var(--syntax-number)]",
  bool: "tw:text-[color:var(--syntax-number)] tw:font-medium",
  cmnt: "tw:text-[color:var(--syntax-comment)] tw:italic",
  oper: "tw:text-[color:var(--syntax-operator)]",
  insert: "tw:text-[color:var(--syntax-inserted)]",
  deleted: "tw:text-[color:var(--syntax-deleted)]",
  err: "tw:text-[color:var(--syntax-deleted)] tw:[text-decoration-line:underline] tw:[text-decoration-style:wavy]",
};

const syntaxByToken = new Map<string, ClassValue>(Object.entries(syntaxStyles));
