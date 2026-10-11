import { drawStyles } from "@canvas/drawing/draw-styles";
import { withClass } from "@canvas/styles/stylex-props";
import { isNumberValue, isStringValue } from "@dev.fast/review-protocol";
import { type MarkdownNode, parseMarkdown } from "@review/documents/markdown";
import * as stylex from "@stylexjs/stylex";
import {
  type ComponentType,
  Fragment,
  type ReactElement,
  type ReactNode,
  createContext,
  createElement,
  useCallback,
  useContext,
  useRef,
} from "react";

import { RenderedCodeBlock } from "./code-block";
import { documentStyles as doc } from "./document-styles";
import { newTabLinkProps } from "./link-props";
import { MarkdownMath } from "./markdown-math";

type LinkRenderer = (href: string, children: ReactNode) => ReactNode;

const DocumentLink = createContext<LinkRenderer | undefined>(undefined);

/** Whether a remote image may be fetched and shown where it was authored. */
const RemoteImages = createContext(false);

/** Saves a task item ticked or unticked, where the source can be saved. */
const TaskToggle = createContext<((item: MarkdownNode) => void) | undefined>(
  undefined,
);

/** Safely render authored Markdown without evaluating embedded HTML. */
export function MarkdownContent({
  source,
  h1: Heading,
  headingId,
  renderLink,
  allowRemoteImages = false,
  onChange,
}: {
  source: string;
  h1?: ComponentType<{ children?: ReactNode }>;
  /** The id of the document's nth h2/h3, undefined where it has none. */
  headingId?: (index: number) => string | undefined;
  renderLink?: LinkRenderer;
  allowRemoteImages?: boolean;
  /** Receives the source with a task item ticked or unticked. */
  onChange?: (source: string) => void;
}): ReactElement {
  const { body, footnotes } = splitFootnotes(parseMarkdown(source));
  // Ids are addressed by ordinal among the h2/h3 alone.
  let heading = 0;

  // Ticks saved but not yet shown build on each other; any other source resets.
  const sent = useRef<string[]>([]);

  const toggle = useCallback(
    (item: MarkdownNode) => {
      if (!sent.current.includes(source)) sent.current = [source];
      const next = toggleTask(sent.current.at(-1)!, item);

      if (next === sent.current.at(-1)) return;
      sent.current.push(next);
      onChange?.(next);
    },
    [onChange, source],
  );

  return (
    <DocumentLink.Provider value={renderLink}>
      <RemoteImages.Provider value={allowRemoteImages}>
        <TaskToggle.Provider value={onChange && toggle}>
          {body.map((node, index) =>
            node.type === "heading" && node.depth === 1 && Heading ? (
              <Heading key={index}>
                {renderMarkdownChildren(node.children ?? [], String(index))}
              </Heading>
            ) : node.type === "heading" && headingId ? (
              createElement(
                `h${node.depth}`,
                {
                  key: index,
                  id:
                    node.depth === 2 || node.depth === 3
                      ? headingId(heading++)
                      : undefined,
                  ...stylex.props(
                    headingStyle(node.depth),
                    drawStyles.blockChild,
                  ),
                },
                renderMarkdownChildren(node.children ?? [], String(index)),
              )
            ) : (
              renderMarkdownNode(node, String(index))
            ),
          )}
          {renderFootnotes(footnotes, "document")}
        </TaskToggle.Provider>
      </RemoteImages.Provider>
    </DocumentLink.Provider>
  );
}

/** Flips the `[ ]` or `[x]` that follows a task item's list marker. */
function toggleTask(source: string, item: MarkdownNode): string {
  const marker = /(?:[-*+]|\d+[.)])[ \t]+\[([ xX])\]/y;
  marker.lastIndex = item.position?.start.offset ?? source.length;
  const match = marker.exec(source);

  if (!match) return source;

  const at = marker.lastIndex - 2;

  return `${source.slice(0, at)}${match[1] === " " ? "x" : " "}${source.slice(at + 1)}`;
}

/** GFM footnote definitions render once, after the body, in reference order. */
function splitFootnotes(tree: MarkdownNode) {
  const body: MarkdownNode[] = [];
  const footnotes: MarkdownNode[] = [];

  for (const node of tree.children ?? [])
    (node.type === "footnoteDefinition" ? footnotes : body).push(node);

  return { body, footnotes };
}

function renderFootnotes(
  footnotes: MarkdownNode[],
  keyPrefix: string,
): ReactNode {
  if (footnotes.length === 0) return null;

  return (
    <section
      data-footnotes=""
      {...withClass("footnotes", drawStyles.blockChild)}
    >
      <ol>
        {footnotes.map((definition, index) => (
          <li
            key={`${keyPrefix}:fn:${index}`}
            id={`fn-${definition.label ?? definition.identifier ?? index}`}
            {...stylex.props(doc.item)}
          >
            {renderMarkdownChildren(
              definition.children ?? [],
              `${keyPrefix}:fn:${index}`,
              doc.itemParagraph,
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export const markdownHasTitle = (source: string) =>
  (parseMarkdown(source).children ?? []).some(
    (node) => node.type === "heading" && node.depth === 1,
  );

/** `paragraph` styles the direct paragraph children alone. */
function renderMarkdownChildren(
  children: MarkdownNode[],
  keyPrefix: string,
  paragraph?: stylex.StyleXStyles,
): ReactNode {
  return children.map((child, index) =>
    renderMarkdownNode(child, `${keyPrefix}:${index}`, paragraph),
  );
}

function renderMarkdownNode(
  node: MarkdownNode,
  key: string,
  paragraph?: stylex.StyleXStyles,
): ReactNode {
  switch (node.type) {
    case "root":
      return (
        <Fragment key={key}>
          {renderMarkdownChildren(node.children ?? [], key)}
        </Fragment>
      );
    case "paragraph":
      return (
        <p
          key={key}
          {...stylex.props([doc.paragraph, drawStyles.blockChild], paragraph)}
        >
          {renderMarkdownChildren(node.children ?? [], key)}
        </p>
      );
    case "text":
      return node.value ?? "";
    case "emphasis":
      return (
        <em key={key}>{renderMarkdownChildren(node.children ?? [], key)}</em>
      );
    case "strong":
      return (
        <strong key={key}>
          {renderMarkdownChildren(node.children ?? [], key)}
        </strong>
      );
    case "delete":
      return (
        <del key={key}>{renderMarkdownChildren(node.children ?? [], key)}</del>
      );
    case "inlineCode":
      return (
        <code key={key} {...stylex.props(doc.code)}>
          {node.value ?? ""}
        </code>
      );
    case "code":
      return (
        <RenderedCodeBlock
          key={key}
          className="markdown-code-block"
          code={node.value ?? ""}
          language={node.lang}
        />
      );
    case "math":
      return <MarkdownMath key={key} tex={node.value ?? ""} display />;
    case "inlineMath":
      // Like Pandoc: "$5 and $10" stays prose.
      if (/^\s|\s$/.test(node.value ?? "")) return `$${node.value}$`;

      return <MarkdownMath key={key} tex={node.value ?? ""} display={false} />;
    case "break":
      return <br key={key} />;
    case "thematicBreak":
      return <hr key={key} {...stylex.props(drawStyles.blockChild)} />;
    case "heading":
      return createElement(
        headingTag(node.depth),
        {
          key,
          ...stylex.props([headingStyle(node.depth), drawStyles.blockChild]),
        },
        renderMarkdownChildren(node.children ?? [], key),
      );
    case "blockquote":
      return (
        <blockquote
          key={key}
          {...stylex.props([doc.serif, doc.column, drawStyles.blockChild])}
        >
          {renderMarkdownChildren(node.children ?? [], key)}
        </blockquote>
      );
    case "list": {
      const Tag = node.ordered ? "ol" : "ul";

      return createElement(
        Tag,
        {
          key,
          start: node.ordered ? (node.start ?? undefined) : undefined,
          ...stylex.props([doc.column, drawStyles.blockChild]),
        },
        renderMarkdownChildren(node.children ?? [], key),
      );
    }

    case "listItem":
      return node.checked === null || node.checked === undefined ? (
        <li key={key} {...stylex.props(doc.item)}>
          {renderMarkdownChildren(node.children ?? [], key, doc.itemParagraph)}
        </li>
      ) : (
        <TaskItem key={key} node={node}>
          {renderMarkdownChildren(
            node.children ?? [],
            key,
            styles.taskParagraph,
          )}
        </TaskItem>
      );
    case "link": {
      const children = renderMarkdownChildren(node.children ?? [], key);

      return (
        <MarkdownLink
          key={key}
          href={node.url ?? ""}
          title={node.title ?? undefined}
        >
          {children}
        </MarkdownLink>
      );
    }

    case "image":
      return (
        <MarkdownImage key={key} url={node.url ?? ""} alt={node.alt ?? ""} />
      );
    case "table":
      return renderTable(node, key);
    case "tableRow":
      return renderTableRow(node, key, false, null);
    case "tableCell":
      return (
        <td key={key} {...stylex.props(doc.cell)}>
          {renderMarkdownChildren(node.children ?? [], key)}
        </td>
      );
    case "footnoteReference": {
      const label = node.label ?? node.identifier ?? "";

      return (
        <sup key={key}>
          <a
            data-footnote-ref=""
            href={`#fn-${label}`}
            id={`fnref-${label}`}
            {...stylex.props(doc.link)}
          >
            {label}
          </a>
        </sup>
      );
    }

    case "footnoteDefinition":
      return null;
    case "html":
      return node.value ?? "";
    default:
      return node.children
        ? renderMarkdownChildren(node.children, key)
        : (node.value ?? null);
  }
}

function headingStyle(depth: number | undefined) {
  if (depth === 1) return doc.h1;

  if (depth === 2) return doc.h2;

  if (depth === 3) return doc.h3;

  return null;
}

function headingTag(depth: number | undefined): "h1" | "h2" | "h3" | "h4" {
  if (depth === 1) return "h1";

  if (depth === 2) return "h2";

  if (depth === 3) return "h3";

  return "h4";
}

function renderTable(node: MarkdownNode, key: string): ReactElement {
  const rows = node.children ?? [];
  const [header, ...body] = rows;

  const align = node.align ?? null;

  return (
    <table key={key} {...stylex.props([doc.table, drawStyles.blockChild])}>
      {header && (
        <thead>{renderTableRow(header, `${key}:head`, true, align)}</thead>
      )}
      <tbody>
        {body.map((row, index) =>
          renderTableRow(row, `${key}:body:${index}`, false, align),
        )}
      </tbody>
    </table>
  );
}

function renderTableRow(
  node: MarkdownNode,
  key: string,
  isHeader: boolean,
  align: Array<string | null> | null,
): ReactElement {
  const Cell = isHeader ? "th" : "td";

  return (
    <tr key={key}>
      {(node.children ?? []).map((cell, index) => {
        const textAlign = cellAlignment(align?.[index]);

        return createElement(
          Cell,
          {
            key: `${key}:cell:${index}`,
            ...stylex.props(doc.cell, isHeader && doc.headerCell),
            style: textAlign ? { textAlign } : undefined,
          },
          renderMarkdownChildren(cell.children ?? [], `${key}:cell:${index}`),
        );
      })}
    </tr>
  );
}

function cellAlignment(
  align: string | null | undefined,
): "left" | "center" | "right" | undefined {
  switch (align) {
    case "left":
    case "center":
    case "right":
      return align;
    default:
      return undefined;
  }
}

function TaskItem({
  node,
  children,
}: {
  node: MarkdownNode;
  children: ReactNode;
}) {
  const toggle = useContext(TaskToggle);

  return (
    <li {...stylex.props(doc.item, styles.task)}>
      <input
        type="checkbox"
        checked={node.checked === true}
        disabled={!toggle}
        onChange={() => toggle?.(node)}
        {...stylex.props(styles.taskBox)}
      />
      <div {...stylex.props(styles.taskBody)}>{children}</div>
    </li>
  );
}

function MarkdownImage({ url, alt }: { url: string; alt: string }): ReactNode {
  // Phrasing content, so an <img> (a <figure> inside <p> is invalid HTML)
  // laid out like an image block.
  if (useContext(RemoteImages) && urlProtocol(url) === "https:")
    return (
      <img src={url} alt={alt} loading="lazy" {...stylex.props(doc.image)} />
    );

  // Images that cannot be safely loaded display their alt text.
  return alt ? <em>{alt}</em> : null;
}

function MarkdownLink({
  href,
  children,
  title,
}: {
  href: string;
  children: ReactNode;
  title?: string;
}): ReactElement {
  const renderLink = useContext(DocumentLink);
  const custom = renderLink?.(href, children);

  if (custom !== undefined) return <>{custom}</>;

  if (isLocalFilesystemHref(href))
    return (
      <code {...withClass("agent-markdown-code-reference", doc.code)}>
        {textFromChildren(children) ?? "local file"}
      </code>
    );

  if (!safeMarkdownHref(href)) return <span>{children}</span>;
  const linkProps = newTabLinkProps(href);

  return (
    <a href={href} title={title} {...linkProps} {...stylex.props(doc.link)}>
      {children}
    </a>
  );
}

function safeMarkdownHref(value: string | undefined): string | null {
  if (!value) return null;

  if (value.startsWith("#")) return value;

  if (isLocalFilesystemHref(value)) return null;
  const protocol = urlProtocol(value);

  return protocol && ["http:", "https:", "mailto:"].includes(protocol)
    ? value
    : null;
}

/** The scheme a href resolves to; a relative one counts as the page's own. */
function urlProtocol(value: string): string | null {
  try {
    return new URL(value, "http://localhost").protocol;
  } catch {
    return null;
  }
}

function isLocalFilesystemHref(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();

  if (/^file:/i.test(trimmed)) return true;

  if (/^[a-z]:[\\/]/i.test(trimmed)) return true;

  return /^\/(?:Users|home|tmp|var|private|Volumes|mnt|workspace)\//.test(
    trimmed,
  );
}

/** A React child that renders as its own text: a string or a number. */
export function isReactTextNode(node: ReactNode): node is string | number {
  return isStringValue(node) || isNumberValue(node);
}

function textFromChildren(children: ReactNode): string | null {
  if (isReactTextNode(children)) return String(children);

  if (Array.isArray(children)) {
    const text = children
      .map((child) => textFromChildren(child) ?? "")
      .join("")
      .trim();

    return text || null;
  }

  return null;
}

const styles = stylex.create({
  // The checkbox replaces the bullet, beside the item's first line.
  task: {
    display: "flex",
    gap: "0.5em",
    listStyle: "none",
  },
  // Centered on the first line of text.
  taskBox: {
    flex: "none",
    width: "1em",
    height: "1em",
    margin: "calc((1lh - 1em) / 2) 0 0",
    font: "inherit",
    lineHeight: "inherit",
    cursor: { default: null, ":enabled": "pointer" },
  },
  taskBody: {
    minWidth: 0,
  },
  taskParagraph: {
    marginTop: { default: null, ":first-child": 0 },
    marginBottom: { default: null, ":last-child": 0 },
  },
});
