import { DocumentCallTree } from "@canvas/diagrams/call-tree-view";
import { DatabaseLens } from "@canvas/diagrams/database-lens";
import { SequenceDiagram } from "@canvas/diagrams/diagrams";
import { FlowDiagram } from "@canvas/diagrams/flow-diagram";
import { CodePeekCard } from "@canvas/diff/CodePeek";
import { useMotionPhase } from "@canvas/drawing/draw-queue-provider";
import { drawStyles } from "@canvas/drawing/draw-styles";
import { cn } from "@canvas/lib/utils";
import { AnchorLink, ReviewSection } from "@canvas/review/review-components";
import { SoftwareMap } from "@canvas/software-map/SoftwareMap";
import { TutorialAuthoringConversation } from "@canvas/tutorial/tutorial-authoring-conversation";
import {
  TutorialFeature,
  TutorialViewButton,
} from "@canvas/tutorial/tutorial-dynamic-content";
import { TutorialKeymapPicker } from "@canvas/tutorial/tutorial-keymap-picker";
import { type Block, type BlockType } from "@review/documents/document";
import {
  Component,
  type ReactNode,
  createContext,
  useContext,
  useMemo,
} from "react";

import { MarkdownContent } from "./agent-markdown";
import type { ApiDocumentData } from "./api-document";
import { blockSectionSummary } from "./block-document-derivations";
import { RenderedCodeBlock } from "./code-block";
import { documentStyles } from "./document-styles";
import { ReviewDocumentTitle } from "./review-document-surface";

/** A block the store has written: ids are assigned before any write. */
export type StoredBlock = Block & { id: string };

const hasId = (block: Block): block is StoredBlock => block.id !== undefined;

/**
 * The one place a stored block's id is checked, instead of `!` at every use.
 * Returns the same object so memoized nodes keep their identity.
 */
export function stored(block: Block): StoredBlock {
  if (!hasId(block)) throw new Error(`Stored ${block.type} block has no id.`);

  return block;
}

type BlockByType = { [K in BlockType]: Extract<StoredBlock, { type: K }> };

export interface BlockProps<K extends BlockType> {
  node: BlockByType[K];
  data: ApiDocumentData;
  /** Renders nested blocks. */
  children(nodes: Block[]): ReactNode;
}

export type BlockComponent<K extends BlockType> = (
  props: BlockProps<K>,
) => ReactNode;

/** Saves a prose block's Markdown, where the shown document can be edited. */
export const SaveMarkdown = createContext<
  ((blockId: string, markdown: string) => void) | undefined
>(undefined);

function MarkdownBlock({ node, data }: BlockProps<"markdown">) {
  const save = useContext(SaveMarkdown);

  const onChange = useMemo(
    () => save && ((markdown: string) => save(node.id, markdown)),
    [save, node.id],
  );

  return (
    <MarkdownContent
      source={node.markdown}
      onChange={onChange}
      headingId={(index) => data.headings.get(node.id, index)}
      h1={ReviewDocumentTitle}
      renderLink={(href, children) => {
        const anchor = data.anchors.get(`${node.id}:${href}`);

        return anchor ? (
          <AnchorLink anchor={anchor}>{children}</AnchorLink>
        ) : undefined;
      }}
      allowRemoteImages
    />
  );
}

function CodeBlock({ node }: BlockProps<"code">) {
  return (
    <RenderedCodeBlock
      code={node.text}
      language={node.language}
      caption={node.caption}
      lineNumbers
    />
  );
}

function DividerBlock() {
  return <hr className={drawStyles.blockChild} />;
}

function SectionBlock({ node, data, children }: BlockProps<"section">) {
  return (
    <ReviewSection
      stateKey={`${data.snapshot.reviewId}:${node.id}`}
      title={node.title}
      id={data.headings.get(node.id)}
      defaultCollapsed={node.defaultCollapsed}
      summary={blockSectionSummary(node.children)}
    >
      {children(node.children)}
    </ReviewSection>
  );
}

function CalloutBlock({ node, children }: BlockProps<"callout">) {
  const retitled = useMotionPhase(node.id) === "retitle";

  return (
    <blockquote
      data-tone={node.tone}
      className={cn(
        documentStyles.body,
        styles.callout,
        styles[node.tone],
        documentStyles.column,
        drawStyles.blockChild,
      )}
    >
      {node.title && (
        <strong
          data-review-copy-prose
          className={cn(retitled && drawStyles.retitle)}
        >
          {node.title}
        </strong>
      )}
      {children(node.children)}
    </blockquote>
  );
}

function CodePeekBlock({ node }: BlockProps<"code_peek">) {
  return <CodePeekCard source={node.source} />;
}

function SequenceBlock({ node }: BlockProps<"sequence">) {
  return (
    <SequenceDiagram
      id={node.id}
      title={node.title}
      actors={node.actors}
      steps={node.steps}
    />
  );
}

function CallStackDiffBlock({ node }: BlockProps<"call_stack_diff">) {
  return <DocumentCallTree block={node} />;
}

function DatabaseLensBlock({ node }: BlockProps<"database_lens">) {
  return (
    <DatabaseLens
      id={node.id}
      title={node.title}
      actors={node.actors}
      stores={node.stores}
      useCases={node.useCases}
    />
  );
}

function ImageBlock({ node, data }: BlockProps<"image">) {
  return (
    <figure className={cn(documentStyles.column, drawStyles.blockChild)}>
      <img
        src={data.images.get(node.assetId)}
        alt={node.alt}
        className={documentStyles.image}
      />
      {node.caption && <figcaption>{node.caption}</figcaption>}
    </figure>
  );
}

function SoftwareMapBlock({ node, data }: BlockProps<"software_map">) {
  return (
    <SoftwareMap
      diagramId={node.id}
      model={data.maps.get(node.mapVersionId)}
      pinnedData={data.maps.get(node.mapVersionId)?.pinnedData}
      view={node.focusElementId}
    />
  );
}

type Components = { [K in BlockType]: BlockComponent<K> };

/** Every block kind's component, keyed by type. A kind without a component is a compile error. */
function TutorialBlock({ node, children }: BlockProps<"tutorial">) {
  switch (node.kind) {
    case "keymap":
      return (
        <div className={cn(documentStyles.column, drawStyles.blockChild)}>
          <TutorialKeymapPicker />
        </div>
      );
    case "conversation":
      return (
        <div className={cn(documentStyles.column, drawStyles.blockChild)}>
          <TutorialAuthoringConversation conversation={node.conversation} />
        </div>
      );
    case "view":
      return (
        <div className={cn(documentStyles.column, drawStyles.blockChild)}>
          <TutorialViewButton view={node.view}>{node.label}</TutorialViewButton>
        </div>
      );
    case "feature":
      return (
        <TutorialFeature feature={node.feature}>
          {children(node.children)}
        </TutorialFeature>
      );
  }
}

export const blockComponents = {
  tutorial: TutorialBlock,
  markdown: MarkdownBlock,
  code: CodeBlock,
  divider: DividerBlock,
  code_peek: CodePeekBlock,
  sequence: SequenceBlock,
  call_stack_diff: CallStackDiffBlock,
  database_lens: DatabaseLensBlock,
  image: ImageBlock,
  flow_diagram: ({ node, data }) => (
    <FlowDiagram node={node} snapshot={data.snapshot} />
  ),
  software_map: SoftwareMapBlock,
  section: SectionBlock,
  callout: CalloutBlock,
} satisfies Components;

/** Render one stored block through its kind's component. */
export function renderBlock<K extends BlockType>(
  type: K,
  node: BlockByType[K],
  data: ApiDocumentData,
  children: BlockProps<K>["children"],
): ReactNode {
  // SAFETY: blockComponents satisfies Components, so its entry for K is that kind's component.
  const Component = blockComponents[type] as BlockComponent<K>;

  return (
    <Component node={node} data={data}>
      {children}
    </Component>
  );
}

interface BlockErrorBoundaryProps {
  block: StoredBlock;
  onError(error: Error): void;
  children: ReactNode;
}

interface BlockErrorBoundaryState {
  block: StoredBlock;
  error: Error | null;
}

/**
 * One block that throws degrades to one alert; the rest of the document
 * stays readable and the error is still reported as a render diagnostic.
 */
export class BlockErrorBoundary extends Component<
  BlockErrorBoundaryProps,
  BlockErrorBoundaryState
> {
  override state: BlockErrorBoundaryState = {
    block: this.props.block,
    error: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: BlockErrorBoundaryProps,
    state: BlockErrorBoundaryState,
  ): BlockErrorBoundaryState | null {
    // An edit replaces the block object; the last failure was for the old one.
    return props.block === state.block
      ? null
      : { block: props.block, error: null };
  }

  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  override render() {
    const { error } = this.state;
    const { type } = this.props.block;

    if (error)
      return (
        <div
          role="alert"
          data-block-error={type}
          className={drawStyles.blockChild}
        >
          This {type.replaceAll("_", " ")} block could not be rendered:{" "}
          {error.message}
        </div>
      );

    return this.props.children;
  }
}

const styles = {
  callout:
    "tw:[&:is(.canvas-document:is(*)_*)]:m-[18px_0] tw:[&:is(.canvas-document:is(*)_*)]:p-[12px_16px] tw:[&:is(.canvas-document:is(*)_*)]:[border-left-width:2px] tw:[&:is(.canvas-document:is(*)_*)]:[border-left-style:solid] tw:[&:is(.canvas-document:is(*)_*)]:[border-left-color:var(--ink-faint)] tw:[&:is(.canvas-document:is(*)_*)]:rounded-[0_6px_6px_0] tw:[&:is(.canvas-document:is(*)_*)]:bg-[color:var(--tray)] tw:[&:is(.canvas-document:is(*)_*)]:text-[length:15px] tw:[&:is(.canvas-document:is(*)_*)]:leading-[22px]",
  info: "tw:[&:is(.canvas-document:is(*)_*)]:[border-left-color:var(--accent)] tw:[&:is(.canvas-document:is(*)_*)]:bg-[color:var(--marker-tint)]",
  warning:
    "tw:[&:is(.canvas-document:is(*)_*)]:[border-left-color:var(--change-modified)] tw:[&:is(.canvas-document:is(*)_*)]:bg-[color:var(--diff-modified-bg)]",
  danger:
    "tw:[&:is(.canvas-document:is(*)_*)]:[border-left-color:var(--change-removed)] tw:[&:is(.canvas-document:is(*)_*)]:bg-[color:var(--diff-removed-bg)]",
  success:
    "tw:[&:is(.canvas-document:is(*)_*)]:[border-left-color:var(--change-added)] tw:[&:is(.canvas-document:is(*)_*)]:bg-[color:var(--diff-added-bg)]",
};
