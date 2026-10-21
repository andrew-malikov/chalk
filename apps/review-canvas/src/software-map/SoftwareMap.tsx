import { useDiagramNavigation } from "@canvas/diagrams/diagram-navigation-machine";
import { diagramStyles } from "@canvas/diagrams/diagram-styles";
import { hasTextSelectionWithin } from "@canvas/diagrams/diagram-text-selection";
import { CodePeekGroup } from "@canvas/diff/CodePeek";
import { useReviewSession } from "@canvas/host/review-session";
import { useCanvasScrollLock } from "@canvas/lib/use-canvas-scroll-lock";
import { cn } from "@canvas/lib/utils";
import { useReviewContainer } from "@canvas/review/review-root-context";
import { useRightPanelResize } from "@canvas/review/side-panel-resizer";
import {
  type ReviewNodeTint,
  type ReviewTheme,
  useReviewDebugSettings,
} from "@canvas/settings/debug-settings";
import {
  appMarker,
  codeInspectorMarker,
  mapFrameMarker,
} from "@canvas/styles/markers";
import { shellStyles } from "@canvas/styles/shell-styles";
import { themeStyles } from "@canvas/styles/theme-styles";
import { IconButton } from "@canvas/ui/button";
import { Chip } from "@canvas/ui/chip";
import { EmptyState } from "@canvas/ui/empty-state";
import { CloseIcon, RefreshIcon } from "@canvas/ui/icons";
import { surfaceStyles } from "@canvas/ui/surface";
import { textStyles } from "@canvas/ui/text";
import { codePeekSource } from "@review/documents/source";
import { useSelector } from "@xstate/react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge as ReactFlowEdge,
  type EdgeProps as ReactFlowEdgeProps,
  type ReactFlowInstance,
  type NodeProps as ReactFlowNodeProps,
} from "@xyflow/react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  c4EdgeLabelPoint,
  c4EdgePointsFromSections,
} from "./c4-edge-label-geometry";
import {
  C4_FIT_VIEW_PADDING,
  C4_FLOW_MAX_ZOOM,
  C4_FLOW_MIN_ZOOM,
  type SoftwareMapDataStoreOutlineKind,
  c4DataStoreSchemaSignature,
  c4EdgeEndpointBubbles,
  c4LayoutSignature,
  c4PreviousInlineLayoutForRelationships,
  createC4MapFlowFromLayout,
  fitC4MapView,
  focusC4MapNodeAndKeyboard,
  revealC4MapNode,
  runInlineC4Layout,
  runSerializedC4Layout,
  softwareMapDataStoreOutlineKind,
} from "./c4-layout-geometry";
import type {
  C4ElkPoint,
  C4LayoutResult,
  C4MapAnyFlowNode,
  C4MapEdgeData,
  C4MapFlowGroupNode,
  C4MapFlowNode,
  C4MapInteractionMode,
  C4NodeDimensions,
  InlineC4LayoutResult,
} from "./c4-map-flow-types";
import { scheduleC4NodeMeasurements } from "./c4-node-measurement";
import { collapseInlineC4Node, projectInlineC4 } from "./c4-projection";
import { SoftwareMapHotkeysTab } from "./hotkeys-tab";
import type {
  NormalizedSoftwareModel,
  SoftwareChangeStatus,
  SoftwareDataStoreKind,
} from "./model";
import {
  SoftwareMapUnavailable,
  softwareMapCssLength,
} from "./software-map-absence";
import {
  C4_MAP_HOTKEY_GROUPS,
  type SoftwareMapViewportFocusRequest,
  c4MapReactFlowInteractionProps,
  c4SpatialDirectionForKey,
  c4SpatialPositions,
  findSpatialC4Node,
  focusSoftwareMapKeyboardTarget,
  isSoftwareMapEditableTarget,
  parentSoftwareMapNodeId,
  selectedSoftwareMapNodeIdForNodes,
  shouldAutoFocusC4MapKeyboardTarget,
  shouldShowSoftwareMapFloatingActions,
  softwareMapChildNodeIdForDrill,
  softwareMapEventTargetNodeId,
  softwareMapNodeForKeyboardExpansion,
  softwareMapNodeIdForDrill,
  softwareMapOverlayClassName,
  softwareMapViewportFocusNodeId,
  softwareMapViewportFocusTargetReady,
  toggledSoftwareMapExpandedNodeIds,
  toggledSoftwareMapViewportFocusRequest,
} from "./software-map-keyboard-navigation";
import {
  initialSoftwareMapExpandedNodeIds,
  seedSoftwareMapDefaultExpandedNodeIds,
  softwareMapAncestorPaths,
  softwareMapNavigationKey,
} from "./software-map-navigation-state";
import {
  shouldApplySoftwareMapModifiedOnly,
  softwareMapModelKey,
  softwareMapResolvedDataInputForModel,
} from "./software-map-resolved-data";
import {
  type SoftwareMapDataStoreSchemaSectionSnapshot,
  type SoftwareMapElementType,
  type SoftwareMapNodeDiffPeek,
  type SoftwareMapNodeSnapshot,
  type SoftwareMapRelationshipSnapshot,
  type SoftwareMapResolvedDataPayload,
  type SoftwareMapResolvedSnapshot,
  type SoftwareMapViewType,
  buildSoftwareMapChangeSummaries,
  c4DisplayedSnapshotForCurrentState,
  softwareMapNodeDiffPeeks,
  softwareMapSnapshotFromInlineC4Projection,
  visibleSoftwareMapChangeCount,
} from "./software-map-snapshot";
import { softwareMapRootProps } from "./software-map-styles";

export type {
  SoftwareMapDataStoreSchemaRowSnapshot,
  SoftwareMapNodeSnapshot,
  SoftwareMapRelationshipSnapshot,
  SoftwareMapResolvedSnapshot,
} from "./software-map-snapshot";

const DEFAULT_CODE_INSPECTOR_WIDTH = 420;

const MIN_CODE_INSPECTOR_WIDTH = 340;

const MAX_CODE_INSPECTOR_WIDTH = 760;

const MIN_SOFTWARE_MAP_CANVAS_WIDTH = 420;

export type PinnedSoftwareMapData = SoftwareMapResolvedDataPayload & {
  side: "base" | "head";
  diagramId?: string;
};

interface SoftwareMapProps {
  diagramId?: string;
  model?: NormalizedSoftwareModel;
  pinnedData?: PinnedSoftwareMapData;
  title?: string;
  view?: string;
  focusRequest?: { requestId: number; elementPath: string } | null;
  onFocusRequestHandled?: (requestId: number) => void;
  height?: number | string;
  snapshot?: SoftwareMapResolvedSnapshot | null;
  resolvedSnapshot?: SoftwareMapResolvedSnapshot | null;
  status?: string | null;
  error?: string | null;
  className?: string;
  placeholderLabel?: string;
  showChrome?: boolean;
  showFloatingActions?: boolean;
  /** "view" fills the map view's canvas shell. */
  variant?: "view";
}

interface SoftwareMapFrameProps {
  diagramId?: string;
  snapshot: SoftwareMapResolvedSnapshot;
  hasResolvedSnapshot: boolean;
  title: string;
  height?: number | string;
  status?: string | null;
  error?: string | null;
  refreshing?: boolean;
  expanded: boolean;
  showChrome: boolean;
  showFloatingActions: boolean;
  /** "view" fills the map view; "lens" sits in a database lens canvas. */
  variant?: "view" | "lens";
  interactionMode: C4MapInteractionMode;
  onRefresh?: () => void;
  onExpand?: () => void;
  onClose?: () => void;
  inspectedNode?: SoftwareMapNodeSnapshot | null;
  inspectedNodeDiffPeeks?: readonly SoftwareMapNodeDiffPeek[];
  onCloseCodeInspector?: () => void;
  onSelectNode?: (node: SoftwareMapNodeSnapshot) => void;
  onExpandNode?: (node: SoftwareMapNodeSnapshot) => void;
  onCollapseNode?: (node: SoftwareMapNodeSnapshot) => void;
  onToggleNodeExpansion?: (node: SoftwareMapNodeSnapshot) => void;
  onFocusNode?: (node: SoftwareMapNodeSnapshot) => void;
  relationshipStateById?: ReadonlyMap<string, "active" | "inactive">;
  onOpenRelationship?: (relationshipId: string) => void;
  selectChildNodeIdForDrill?: (
    parentId: string,
    nodes: readonly Pick<SoftwareMapNodeSnapshot, "id" | "parentId">[],
  ) => string | null;
  viewportFocusNodeId?: string | null;
  viewportFocusRequiresExpanded?: boolean;
  onViewportFocusComplete?: (nodeId: string) => void;
}

interface C4DisplayedLayoutState {
  signature: string;
  snapshot: SoftwareMapResolvedSnapshot;
  layout: C4LayoutResult;
}

const ELEMENT_TYPE_LABELS: Record<SoftwareMapElementType, string> = {
  person: "Person",
  softwareSystem: "System",
  container: "Container",
  dataStore: "Data Store",
  dataStoreCollection: "Table",
  component: "Component",
  codeElement: "Code",
};

const DATA_STORE_KIND_LABELS: Record<SoftwareDataStoreKind, string> = {
  database: "Database",
  objectStore: "Object Store",
  bucket: "Bucket",
  artifactStore: "Artifact Store",
  fileStore: "File Store",
};

const VIEW_TYPE_LABELS: Record<SoftwareMapViewType, string> = {
  inlineC4: "Inline map",
};

function softwareMapNodeTypeLabel(
  node: Pick<
    SoftwareMapNodeSnapshot,
    "type" | "dataStoreKind" | "dataStoreSchemaSections"
  >,
) {
  if (node.type === "dataStore") {
    return DATA_STORE_KIND_LABELS[node.dataStoreKind ?? "database"];
  }

  if (node.type === "dataStoreCollection") {
    const sectionKind = node.dataStoreSchemaSections?.[0]?.kind;

    return sectionKind === "document" ? "Document" : "Table";
  }

  return ELEMENT_TYPE_LABELS[node.type];
}

const softwareMapC4NodeTypes = {
  softwareMapC4: SoftwareMapC4Node,
  softwareMapC4Group: SoftwareMapC4GroupNode,
};

const softwareMapC4EdgeTypes = {
  softwareMapC4Edge: SoftwareMapC4Edge,
};

const c4NodeTypes = softwareMapC4NodeTypes;

const c4EdgeTypes = softwareMapC4EdgeTypes;

const C4HoveredNodeContext = createContext<string | null>(null);

export function SoftwareMap(props: SoftwareMapProps) {
  if (!props.model && !props.snapshot && !props.resolvedSnapshot) {
    return (
      <SoftwareMapUnavailable
        title={props.title}
        height={props.height ?? 520}
        className={props.className}
        variant={props.variant}
      />
    );
  }

  return <SoftwareMapWithModel {...props} />;
}

function SoftwareMapWithModel({
  model,
  pinnedData,
  diagramId = pinnedData?.diagramId,
  title,
  view,
  focusRequest,
  onFocusRequestHandled,
  height = 520,
  snapshot,
  resolvedSnapshot,
  status,
  error,
  className,
  placeholderLabel = "Software map",
  showChrome = true,
  showFloatingActions = true,
  variant,
}: SoftwareMapProps) {
  const session = useReviewSession();
  const portalTarget = useReviewContainer();
  const debugSettings = useReviewDebugSettings();
  const { showRemovedNodes } = debugSettings;

  // A pinned map with no mapped changes is still useful as an architecture view.
  const showModifiedOnly =
    debugSettings.showModifiedOnly &&
    (!pinnedData ||
      pinnedData.counts.size > 0 ||
      pinnedData.unmappedByElementPath.size > 0);

  const modelKey = useMemo(
    () =>
      softwareMapModelKey({
        model,
        view,
        showModifiedOnly,
        showRemovedNodes,
      }),
    [model, showModifiedOnly, showRemovedNodes, view],
  );

  const navigationKey = softwareMapNavigationKey({
    title: diagramId ?? title,
    view,
    placeholderLabel,
  });

  const storageKey = session.storageKey(
    "software-map-navigation",
    navigationKey,
  );

  const initialExpandedNodeIds = useMemo(
    () => initialSoftwareMapExpandedNodeIds(model),
    [modelKey],
  );

  const navigation = useDiagramNavigation(
    storageKey,
    modelKey,
    initialExpandedNodeIds,
  );

  const expanded = useSelector(
    navigation,
    (snapshot) => snapshot.context.expanded,
  );

  const expandedNodeIds = useSelector(
    navigation,
    (snapshot) => snapshot.context.expandedNodeIds,
  );

  const selectedNodeId = useSelector(
    navigation,
    (snapshot) => snapshot.context.selectedNodeId,
  );

  const setExpanded = (expanded: boolean) =>
    navigation.send({ type: "setExpanded", expanded });

  const setExpandedNodeIds = (next: SetStateAction<Set<string>>) =>
    navigation.send({ type: "setExpandedNodeIds", next });

  const setSelectedNodeId = (next: SetStateAction<string | null>) =>
    navigation.send({ type: "setSelectedNodeId", next });

  const [inspectedNode, setInspectedNode] =
    useState<SoftwareMapNodeSnapshot | null>(null);

  useEffect(() => setInspectedNode(null), [modelKey, navigationKey]);

  const softwareMapResolvedDataInput = useMemo(
    () =>
      model
        ? softwareMapResolvedDataInputForModel(model, {
            expandedElementPaths: expandedNodeIds,
          })
        : null,
    [expandedNodeIds, model],
  );

  const [viewportFocusRequest, setViewportFocusRequest] =
    useState<SoftwareMapViewportFocusRequest | null>(null);

  const resolvedDataState = pinnedData ?? {
    counts: new Map(),
    unmappedByElementPath: new Map(),
  };

  const mapRootRef = useRef<HTMLElement | null>(null);

  const defaultExpansionActiveRef = useMemo(
    () => ({ current: !navigation.getSnapshot().context.restored }),
    [navigation, storageKey, modelKey],
  );

  useLayoutEffect(() => {
    defaultExpansionActiveRef.current =
      !navigation.getSnapshot().context.restored;
  }, [navigation, storageKey, modelKey]);

  const rememberedChildNodeIdsRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!focusRequest) return;
    const targetPath = focusRequest.elementPath;
    setExpandedNodeIds((current) => {
      const next = new Set(current);

      for (const ancestorPath of softwareMapAncestorPaths(targetPath)) {
        next.add(ancestorPath);
      }

      return next;
    });
    setSelectedNodeId(targetPath);
    setViewportFocusRequest({
      nodeId: targetPath,
      requireExpanded: false,
    });
  }, [focusRequest, navigation, storageKey, modelKey]);

  const resolvedDataReady = Boolean(pinnedData);

  const projectionModel = useMemo(
    () => (model && resolvedDataReady ? model : null),
    [model, resolvedDataReady],
  );

  useEffect(() => {
    if (!projectionModel || !defaultExpansionActiveRef.current) return;
    setExpandedNodeIds((current) => {
      const next = seedSoftwareMapDefaultExpandedNodeIds({
        expandedNodeIds: current,
        model: projectionModel,
        defaultExpansionActive: defaultExpansionActiveRef.current,
      });

      if (
        next.size === current.size &&
        [...current].every((nodeId) => next.has(nodeId))
      ) {
        return current;
      }

      return next;
    });
  }, [projectionModel, navigation, storageKey, modelKey]);

  const changeSummaries = useMemo(
    () =>
      projectionModel
        ? buildSoftwareMapChangeSummaries(
            projectionModel,
            resolvedDataReady ? resolvedDataState.counts : new Map(),
            resolvedDataReady
              ? resolvedDataState.unmappedByElementPath
              : new Map(),
          )
        : new Map(),
    [projectionModel, resolvedDataReady, resolvedDataState],
  );

  const modifiedOnlyNodeIds = useMemo(
    () =>
      new Set(
        changeSummaries
          .entries()
          .filter(([, summary]) => summary.changeStatus !== "unchanged")
          .map(([path]) => path),
      ),
    [changeSummaries],
  );

  const shouldApplyModifiedOnly = shouldApplySoftwareMapModifiedOnly({
    showModifiedOnly,
    resolvedDataReady,
    resolvedDataInput: softwareMapResolvedDataInput,
  });

  const modelSnapshotState = useMemo(() => {
    if (!projectionModel) {
      return {
        snapshot: null,
        error: null,
      };
    }

    try {
      return {
        snapshot: softwareMapSnapshotFromInlineC4Projection({
          projection: projectInlineC4({
            model: projectionModel,
            expandedNodeIds,
            selectedNodeId: selectedNodeId ?? undefined,
            modifiedOnly: shouldApplyModifiedOnly,
            showRemovedNodes,
            changedNodeIds: modifiedOnlyNodeIds,
          }),
          changeSummaries,
        }),
        error: null,
      };
    } catch (caught) {
      return {
        snapshot: null,
        error: caught instanceof Error ? caught.message : String(caught),
      };
    }
  }, [
    changeSummaries,
    expandedNodeIds,
    modifiedOnlyNodeIds,
    selectedNodeId,
    shouldApplyModifiedOnly,
    showRemovedNodes,
    projectionModel,
  ]);

  const activeModelSnapshot = modelSnapshotState.snapshot;

  const providedSnapshot =
    snapshot ?? resolvedSnapshot ?? activeModelSnapshot ?? null;

  const hasResolvedSnapshot = Boolean(providedSnapshot);

  const mapSnapshot = useMemo(() => {
    const base =
      providedSnapshot ?? createPlaceholderSnapshot(placeholderLabel, view);

    const selectedForView = selectedSoftwareMapNodeIdForNodes({
      nodes: base.nodes ?? [],
      selectedNodeId,
    });

    return selectedForView
      ? { ...base, selectedNodeId: selectedForView }
      : base;
  }, [view, placeholderLabel, providedSnapshot, selectedNodeId]);

  const inspectedNodeDiffPeeks = useMemo(() => {
    if (!inspectedNode) return [];

    if (projectionModel && inspectedNode.path) {
      return softwareMapNodeDiffPeeks({
        model: projectionModel,
        elementPath: inspectedNode.path,
        changeSummaries,
        sourceSide: pinnedData?.side,
      });
    }

    if (!inspectedNode.file || !inspectedNode.line) return [];
    const graph = inspectedNode.changeStatus === "removed" ? "base" : "head";

    return [
      {
        file: inspectedNode.file,
        fromLine: inspectedNode.line,
        toLine: inspectedNode.line,
        graph,
      } satisfies SoftwareMapNodeDiffPeek,
    ];
  }, [changeSummaries, inspectedNode, projectionModel, pinnedData?.side]);

  useEffect(() => {
    if (!hasResolvedSnapshot) return;

    const nextSelectedNodeId = selectedSoftwareMapNodeIdForNodes({
      nodes: mapSnapshot.nodes ?? [],
      selectedNodeId,
    });

    // Keep a selection made after this render (e.g. a focus request's).
    if (nextSelectedNodeId !== selectedNodeId) {
      setSelectedNodeId((current) =>
        current === selectedNodeId ? nextSelectedNodeId : current,
      );
    }
  }, [hasResolvedSnapshot, mapSnapshot.nodes, selectedNodeId, navigation]);

  useEffect(() => {
    if (
      focusRequest &&
      mapSnapshot.selectedNodeId === focusRequest.elementPath
    ) {
      onFocusRequestHandled?.(focusRequest.requestId);
    }
  }, [focusRequest, mapSnapshot.selectedNodeId]);

  const frameTitle = title ?? mapSnapshot.title ?? placeholderLabel;

  const statusMessage =
    status ?? mapSnapshot.status ?? modelSnapshotState.error ?? null;

  const errorMessage = error;

  const rememberChildNodeFocus = useCallback(
    (node: Pick<SoftwareMapNodeSnapshot, "id" | "parentId">) => {
      if (node.parentId) {
        rememberedChildNodeIdsRef.current.set(node.parentId, node.id);
      }
    },
    [],
  );

  const selectChildNodeIdForDrill = useCallback(
    (
      parentId: string,
      nodes: readonly Pick<SoftwareMapNodeSnapshot, "id" | "parentId">[],
    ) =>
      softwareMapChildNodeIdForDrill({
        nodes,
        parentId,
        rememberedChildNodeId:
          rememberedChildNodeIdsRef.current.get(parentId) ?? null,
      }),
    [],
  );

  const handleSelectNode = (node: SoftwareMapNodeSnapshot) => {
    rememberChildNodeFocus(node);
    setViewportFocusRequest(null);
    setSelectedNodeId(node.id);
    setInspectedNode(node);
  };

  const handleFocusNode = (node: SoftwareMapNodeSnapshot) => {
    setViewportFocusRequest({
      nodeId: node.id,
      requireExpanded: false,
    });
  };

  const handleExpandNode = (node: SoftwareMapNodeSnapshot) => {
    if (!node.path || !node.expandable) return;
    defaultExpansionActiveRef.current = false;
    setInspectedNode(node);

    if (!projectionModel) {
      setSelectedNodeId(node.id);

      return;
    }

    const nextExpandedNodeIds = new Set(expandedNodeIds);
    nextExpandedNodeIds.add(node.path);

    const nextProjection = projectInlineC4({
      model: projectionModel,
      expandedNodeIds: nextExpandedNodeIds,
      selectedNodeId: node.id,
      modifiedOnly: shouldApplyModifiedOnly,
      showRemovedNodes,
      changedNodeIds: modifiedOnlyNodeIds,
    });

    const nextNodes = nextProjection.nodes.map((element) => ({
      id: element.id,
      parentId: element.parentPath ?? null,
    }));

    const childNodeId =
      selectChildNodeIdForDrill(node.id, nextNodes) ?? node.id;

    if (childNodeId !== node.id) {
      rememberChildNodeFocus({
        id: childNodeId,
        parentId: node.id,
      });
    }

    setSelectedNodeId(childNodeId);
    setViewportFocusRequest({
      nodeId: node.id,
      requireExpanded: true,
    });
    setExpandedNodeIds(nextExpandedNodeIds);
  };

  const handleCollapseNode = (node: SoftwareMapNodeSnapshot) => {
    if (!node.path) return;
    defaultExpansionActiveRef.current = false;
    setViewportFocusRequest({
      nodeId: node.id,
      requireExpanded: false,
    });
    setSelectedNodeId(node.id);
    setExpandedNodeIds((current) => collapseInlineC4Node(current, node.path!));
  };

  const handleToggleNodeExpansion = (node: SoftwareMapNodeSnapshot) => {
    if (!node.path || !node.expandable) return;
    defaultExpansionActiveRef.current = false;
    setSelectedNodeId(node.id);
    setViewportFocusRequest(toggledSoftwareMapViewportFocusRequest(node));
    setExpandedNodeIds((current) =>
      toggledSoftwareMapExpandedNodeIds({
        expandedNodeIds: current,
        node,
      }),
    );
  };

  const handleCloseCodeInspector = () => setInspectedNode(null);

  useCanvasScrollLock(expanded);

  const frame = (
    <SoftwareMapFrame
      diagramId={diagramId}
      snapshot={mapSnapshot}
      hasResolvedSnapshot={hasResolvedSnapshot}
      title={frameTitle}
      height={height}
      status={statusMessage}
      error={errorMessage}
      expanded={false}
      showChrome={showChrome}
      showFloatingActions={showFloatingActions}
      variant={variant}
      interactionMode={showChrome ? "inline" : "standalone"}
      onExpand={() => setExpanded(true)}
      onCloseCodeInspector={handleCloseCodeInspector}
      inspectedNode={inspectedNode}
      inspectedNodeDiffPeeks={inspectedNodeDiffPeeks}
      onSelectNode={handleSelectNode}
      onExpandNode={handleExpandNode}
      onCollapseNode={handleCollapseNode}
      onToggleNodeExpansion={handleToggleNodeExpansion}
      onFocusNode={handleFocusNode}
      selectChildNodeIdForDrill={selectChildNodeIdForDrill}
      viewportFocusNodeId={viewportFocusRequest?.nodeId ?? null}
      viewportFocusRequiresExpanded={viewportFocusRequest?.requireExpanded}
      onViewportFocusComplete={(nodeId) => {
        setViewportFocusRequest((current) =>
          current?.nodeId === nodeId ? null : current,
        );
      }}
    />
  );

  return (
    <section
      ref={mapRootRef}
      {...softwareMapRootProps(className, variant)}
      aria-label={frameTitle}
    >
      {frame}
      {/* The desktop build wraps every canvas rule in
          @scope (.review-canvas-root), so the overlay must portal INSIDE the
          canvas root or it renders unstyled. */}
      {expanded && portalTarget
        ? createPortal(
            <div
              {...softwareMapOverlayProps(debugSettings)}
              role="dialog"
              aria-modal="true"
              aria-label={`${frameTitle} expanded`}
            >
              <SoftwareMapFrame
                diagramId={diagramId}
                snapshot={mapSnapshot}
                hasResolvedSnapshot={hasResolvedSnapshot}
                title={frameTitle}
                status={statusMessage}
                error={errorMessage}
                expanded
                showChrome
                showFloatingActions={showFloatingActions}
                interactionMode="standalone"
                onClose={() => setExpanded(false)}
                onCloseCodeInspector={handleCloseCodeInspector}
                inspectedNode={inspectedNode}
                inspectedNodeDiffPeeks={inspectedNodeDiffPeeks}
                onSelectNode={handleSelectNode}
                onExpandNode={handleExpandNode}
                onCollapseNode={handleCollapseNode}
                onToggleNodeExpansion={handleToggleNodeExpansion}
                onFocusNode={handleFocusNode}
                selectChildNodeIdForDrill={selectChildNodeIdForDrill}
                viewportFocusNodeId={viewportFocusRequest?.nodeId ?? null}
                viewportFocusRequiresExpanded={
                  viewportFocusRequest?.requireExpanded
                }
                onViewportFocusComplete={(nodeId) => {
                  setViewportFocusRequest((current) =>
                    current?.nodeId === nodeId ? null : current,
                  );
                }}
              />
            </div>,
            portalTarget,
          )
        : null}
    </section>
  );
}

export function SoftwareMapFrame({
  snapshot,
  diagramId,
  hasResolvedSnapshot,
  title,
  height,
  status,
  error,
  refreshing,
  expanded,
  showChrome,
  showFloatingActions,
  variant,
  interactionMode,
  onRefresh,
  onExpand,
  onClose,
  inspectedNode,
  inspectedNodeDiffPeeks = [],
  onCloseCodeInspector,
  onSelectNode,
  onExpandNode,
  onCollapseNode,
  onToggleNodeExpansion,
  onFocusNode,
  relationshipStateById,
  onOpenRelationship,
  selectChildNodeIdForDrill,
  viewportFocusNodeId,
  viewportFocusRequiresExpanded,
  onViewportFocusComplete,
}: SoftwareMapFrameProps) {
  const frameRef = useRef<HTMLElement | null>(null);

  const codeInspectorResize = useRightPanelResize({
    // The expanded overlay is far wider than the inline frame, so it keeps its
    // own width instead of having a wide drag clamped down over the inline one.
    stateKey: expanded
      ? "code-inspector-width-expanded"
      : "code-inspector-width",
    defaultWidth: DEFAULT_CODE_INSPECTOR_WIDTH,
    minWidth: MIN_CODE_INSPECTOR_WIDTH,
    maxWidth: MAX_CODE_INSPECTOR_WIDTH,
    minMainWidth: MIN_SOFTWARE_MAP_CANVAS_WIDTH,
    separatorWidth: 10,
    label: "Resize code inspector",
    containerRef: frameRef,
  });

  const viewType = snapshot.viewType ?? "inlineC4";

  // SAFETY: React passes "--*" keys through to style.setProperty; CSSProperties
  // only lacks an index signature for custom properties.
  const style =
    height && !expanded
      ? ({
          "--software-map-height": softwareMapCssLength(height),
        } as CSSProperties)
      : undefined;

  // SAFETY: React passes "--*" keys through to style.setProperty; CSSProperties
  // only lacks an index signature for custom properties.
  const bodyStyle = inspectedNode
    ? ({
        "--software-map-inspector-width": `${codeInspectorResize.width}px`,
      } as CSSProperties)
    : undefined;

  const showMapFloatingActions = shouldShowSoftwareMapFloatingActions({
    showChrome,
    showFloatingActions,
    hasCodeInspector: inspectedNode !== null,
    hasRefreshAction: Boolean(onRefresh),
  });

  return (
    <figure
      ref={frameRef}
      {...softwareMapFrameProps({ expanded, showChrome, variant })}
      style={style}
    >
      {showChrome && (
        <header className={styles.header}>
          <div className={cn(diagramStyles.headerMain, styles.titleBlock)}>
            <Chip className={styles.kindBadge}>
              {VIEW_TYPE_LABELS[viewType]}
            </Chip>
            <figcaption
              className={cn(diagramStyles.title, styles.title)}
              data-review-copy-prose
            >
              {title}
            </figcaption>
          </div>
          <div className={styles.actions}>
            {onRefresh ? (
              <IconButton
                className={refreshing && styles.refreshing}
                onClick={onRefresh}
                aria-label="Refresh software map"
                title="Refresh software map"
              >
                <RefreshIcon />
              </IconButton>
            ) : null}
            {expanded ? (
              <IconButton
                onClick={onClose}
                aria-label="Close expanded software map"
              >
                <CloseIcon />
              </IconButton>
            ) : (
              <IconButton
                className={styles.expandButton}
                onClick={onExpand}
                aria-label="Expand software map"
              >
                <span className={styles.expandIcon} aria-hidden="true" />
              </IconButton>
            )}
          </div>
        </header>
      )}
      {showMapFloatingActions && onRefresh ? (
        <div className={cn(surfaceStyles.popover, styles.floatingActions)}>
          <IconButton
            className={refreshing && styles.refreshing}
            onClick={onRefresh}
            aria-label="Refresh software map"
            title="Refresh software map"
          >
            <RefreshIcon />
          </IconButton>
        </div>
      ) : null}

      <div
        className={cn(
          styles.body,
          inspectedNode && styles.bodyWithInspector,
          codeInspectorResize.isResizing && styles.bodyResizing,
        )}
        style={bodyStyle}
      >
        {/* The class is the block tests' hook for a drawn map. */}
        <div className={cn("software-map-canvas", styles.canvas)}>
          {(status || error || !hasResolvedSnapshot) && (
            <div
              className={cn(
                styles.status,
                Boolean(error) && styles.statusError,
              )}
            >
              {error ?? status ?? "Loading software map..."}
            </div>
          )}

          <C4MapCanvas
            snapshot={snapshot}
            expanded={expanded}
            lens={variant === "lens"}
            interactionMode={interactionMode}
            onSelectNode={onSelectNode}
            onExpandNode={onExpandNode}
            onCollapseNode={onCollapseNode}
            onToggleNodeExpansion={onToggleNodeExpansion}
            onFocusNode={onFocusNode}
            relationshipStateById={relationshipStateById}
            onOpenRelationship={onOpenRelationship}
            selectChildNodeIdForDrill={selectChildNodeIdForDrill}
            viewportFocusNodeId={viewportFocusNodeId}
            viewportFocusRequiresExpanded={viewportFocusRequiresExpanded}
            onViewportFocusComplete={onViewportFocusComplete}
          />
        </div>
        {inspectedNode ? (
          <>
            <button
              type="button"
              className={styles.inspectorBackdrop}
              aria-label="Close code inspector"
              onClick={onCloseCodeInspector}
            />
            <div
              className={cn(shellStyles.resizer, styles.inspectorResizer)}
              {...codeInspectorResize.separatorProps}
            />
            <SoftwareMapCodeInspector
              node={inspectedNode}
              diffPeeks={inspectedNodeDiffPeeks}
              onClose={onCloseCodeInspector}
            />
          </>
        ) : null}
      </div>
    </figure>
  );
}

function SoftwareMapCodeInspector({
  node,
  diffPeeks,
  onClose,
}: {
  node: SoftwareMapNodeSnapshot;
  diffPeeks: readonly SoftwareMapNodeDiffPeek[];
  onClose?: () => void;
}) {
  const [diffsCollapsed, setDiffsCollapsed] = useState(false);

  const diffPeekSources = useMemo(
    () => diffPeeks.map(codePeekSource),
    [diffPeeks],
  );

  const collapseActionLabel = diffsCollapsed
    ? "Expand all diffs"
    : "Collapse all diffs";

  return (
    // The marker is the hook code peeks restyle themselves by in the inspector.
    <aside
      className={cn(styles.inspector, codeInspectorMarker)}
      aria-label={`${node.label} diff`}
    >
      <header className={styles.inspectorHeader}>
        <div className={styles.inspectorTitle}>
          <span className={cn(textStyles.eyebrow, styles.inspectorKind)}>
            {softwareMapNodeTypeLabel(node)}
          </span>
          <strong className={styles.inspectorLabel} title={node.label}>
            {node.label}
          </strong>
        </div>
        <div className={styles.inspectorActions}>
          {diffPeeks.length > 0 ? (
            <IconButton
              onClick={() => setDiffsCollapsed((current) => !current)}
              aria-expanded={!diffsCollapsed}
              aria-label={collapseActionLabel}
              title={collapseActionLabel}
            >
              <span
                className={cn(
                  `codicon ${diffsCollapsed ? "codicon-unfold" : "codicon-fold"}`,
                  styles.codicon,
                )}
                aria-hidden="true"
              />
            </IconButton>
          ) : null}
          <SoftwareMapChangeBadge
            additions={node.additions}
            deletions={node.deletions}
          />
          <IconButton onClick={onClose} aria-label="Close code inspector">
            <CloseIcon />
          </IconButton>
        </div>
      </header>
      <div className={styles.inspectorDiffs}>
        {diffPeeks.length > 0 ? (
          <CodePeekGroup peeks={diffPeekSources} collapsed={diffsCollapsed} />
        ) : (
          <EmptyState
            className={styles.inspectorEmpty}
            message="No changed code is mapped to this node."
          />
        )}
      </div>
    </aside>
  );
}

/** The expanded map's layer, which carries the review theme with it. */
export function softwareMapOverlayProps(settings: {
  theme: ReviewTheme;
  nodeTint: ReviewNodeTint;
}) {
  return {
    className: cn(
      softwareMapOverlayClassName(settings),
      appMarker,
      themeStyles.vars,
      themeStyles.app,
      settings.theme === "light" && themeStyles.light,
      styles.overlay,
    ),
  };
}

/** A map frame's style props. */
export function softwareMapFrameProps({
  expanded,
  showChrome,
  variant,
}: Pick<SoftwareMapFrameProps, "expanded" | "showChrome" | "variant">) {
  return {
    className: cn(
      mapFrameMarker,
      styles.frame,
      expanded && styles.frameExpanded,
      !showChrome && styles.frameChromeHidden,
      variant === "view" && styles.frameView,
      variant === "lens" && styles.frameLens,
    ),
  };
}

function C4MapCanvas({
  snapshot,
  expanded,
  lens,
  interactionMode,
  onSelectNode,
  onExpandNode,
  onCollapseNode,
  onToggleNodeExpansion,
  onFocusNode,
  relationshipStateById,
  onOpenRelationship,
  selectChildNodeIdForDrill,
  viewportFocusNodeId,
  viewportFocusRequiresExpanded,
  onViewportFocusComplete,
}: {
  snapshot: SoftwareMapResolvedSnapshot;
  expanded: boolean;
  lens?: boolean;
  interactionMode: C4MapInteractionMode;
  onSelectNode?: (node: SoftwareMapNodeSnapshot) => void;
  onExpandNode?: (node: SoftwareMapNodeSnapshot) => void;
  onCollapseNode?: (node: SoftwareMapNodeSnapshot) => void;
  onToggleNodeExpansion?: (node: SoftwareMapNodeSnapshot) => void;
  onFocusNode?: (node: SoftwareMapNodeSnapshot) => void;
  relationshipStateById?: ReadonlyMap<string, "active" | "inactive">;
  onOpenRelationship?: (relationshipId: string) => void;
  selectChildNodeIdForDrill?: (
    parentId: string,
    nodes: readonly Pick<SoftwareMapNodeSnapshot, "id" | "parentId">[],
  ) => string | null;
  viewportFocusNodeId?: string | null;
  viewportFocusRequiresExpanded?: boolean;
  onViewportFocusComplete?: (nodeId: string) => void;
}) {
  const session = useReviewSession();

  const [layoutState, setLayoutState] = useState<C4DisplayedLayoutState | null>(
    null,
  );

  const [layoutError, setLayoutError] = useState<string | null>(null);
  const keyboardTargetRef = useRef<HTMLDivElement | null>(null);

  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    C4MapAnyFlowNode,
    ReactFlowEdge
  > | null>(null);

  const [hotkeysOpen, setHotkeysOpen] = useState(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const flowRef = useRef<ReactFlowInstance<
    C4MapAnyFlowNode,
    ReactFlowEdge
  > | null>(null);

  const previousInlineLayoutRef = useRef<{
    layout: InlineC4LayoutResult;
    relationships: readonly SoftwareMapRelationshipSnapshot[];
  } | null>(null);

  const appliedLayoutSignatureRef = useRef<string | null>(null);

  const [nodeMeasurement, setNodeMeasurement] = useState<{
    key: string;
    dimensions: ReadonlyMap<string, C4NodeDimensions>;
  } | null>(null);

  const measuredNodes = snapshot.nodes ?? [];
  const measuredRelationships = snapshot.relationships ?? [];

  const displayedSnapshot = useMemo(
    () =>
      layoutState
        ? c4DisplayedSnapshotForCurrentState(layoutState.snapshot, snapshot)
        : snapshot,
    [layoutState, snapshot],
  );

  const layout = layoutState?.layout ?? null;
  const nodes = displayedSnapshot.nodes ?? [];
  const { theme } = useReviewDebugSettings();

  const reactFlowInteractionProps =
    c4MapReactFlowInteractionProps(interactionMode);

  const measurementKey = useMemo(
    () => c4MeasurementKey(measuredNodes),
    [measuredNodes],
  );

  const nodeDimensions =
    nodeMeasurement?.key === measurementKey ? nodeMeasurement.dimensions : null;

  const hasMeasuredNodes =
    measuredNodes.length === 0 ||
    (nodeDimensions !== null &&
      measuredNodes.every((node) => nodeDimensions.has(node.id)));

  const handleMeasuredNodes = useCallback(
    (nextDimensions: ReadonlyMap<string, C4NodeDimensions>) => {
      setNodeMeasurement((currentMeasurement) =>
        currentMeasurement?.key === measurementKey &&
        c4DimensionsEqual(currentMeasurement.dimensions, nextDimensions)
          ? currentMeasurement
          : { key: measurementKey, dimensions: nextDimensions },
      );
    },
    [measurementKey],
  );

  const layoutSignature = useMemo(
    () =>
      hasMeasuredNodes
        ? c4LayoutSignature(
            measuredNodes,
            measuredRelationships,
            nodeDimensions,
          )
        : "",
    [hasMeasuredNodes, measuredNodes, measuredRelationships, nodeDimensions],
  );

  const layoutInputRef = useRef({
    snapshot,
    nodes: measuredNodes,
    relationships: measuredRelationships,
    nodeDimensions,
  });

  layoutInputRef.current = {
    snapshot,
    nodes: measuredNodes,
    relationships: measuredRelationships,
    nodeDimensions,
  };

  const wasmUrl = session.wasmUrl();

  useEffect(() => {
    if (!hasMeasuredNodes || !layoutSignature) return;

    if (appliedLayoutSignatureRef.current === layoutSignature) return;
    let cancelled = false;
    setLayoutError(null);

    const {
      nodes: layoutNodes,
      relationships: layoutRelationships,
      nodeDimensions: layoutNodeDimensions,
      snapshot: layoutSnapshot,
    } = layoutInputRef.current;

    const previousInlineLayout = c4PreviousInlineLayoutForRelationships({
      previousLayout: previousInlineLayoutRef.current?.layout,
      previousRelationships: previousInlineLayoutRef.current?.relationships,
      currentRelationships: layoutRelationships,
    });

    void runSerializedC4Layout(() =>
      cancelled
        ? Promise.resolve(null)
        : runInlineC4Layout(
            layoutNodes,
            layoutRelationships,
            layoutNodeDimensions ?? undefined,
            // A newly resolved edge changes the graph that determines node
            // placement. Reusing a no-edge layout keeps the graph in its old
            // stack, even though the edge itself is present.
            previousInlineLayout,
            wasmUrl,
          ),
    )
      .then((nextLayout) => {
        if (cancelled || !nextLayout) return;
        appliedLayoutSignatureRef.current = layoutSignature;
        previousInlineLayoutRef.current = {
          layout: nextLayout.inlineLayout,
          relationships: layoutRelationships,
        };
        setLayoutState({
          signature: layoutSignature,
          snapshot: layoutSnapshot,
          layout: nextLayout.layout,
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setLayoutError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [hasMeasuredNodes, layoutSignature, wasmUrl]);

  const layoutRefreshing = Boolean(
    layoutState && layoutSignature && layoutState.signature !== layoutSignature,
  );

  const drillNode = useCallback(
    (node: SoftwareMapNodeSnapshot) => {
      const drillNodeId = softwareMapNodeIdForDrill({
        node,
        nodes,
        preferredChildNodeId: selectChildNodeIdForDrill?.(node.id, nodes),
      });

      if (drillNodeId !== node.id) {
        const childNode = nodes.find(
          (candidate) => candidate.id === drillNodeId,
        );

        if (childNode) onSelectNode?.(childNode);

        return;
      }

      onExpandNode?.(node);
    },
    [nodes, onExpandNode, onSelectNode, selectChildNodeIdForDrill],
  );

  const flow = useMemo(
    () =>
      layout
        ? createC4MapFlowFromLayout(displayedSnapshot, layout, {
            onSelectNode,
            onExpandNode,
            onCollapseNode,
            onDrillNode: drillNode,
            nodeDimensions: nodeDimensions ?? undefined,
            relationshipStateById,
            onOpenRelationship,
            nodeClassName: FLOW_NODE_CLASS_NAME,
            edgeClassName: FLOW_EDGE_CLASS_NAME,
          })
        : null,
    [
      drillNode,
      layout,
      nodeDimensions,
      onCollapseNode,
      onExpandNode,
      onSelectNode,
      onOpenRelationship,
      relationshipStateById,
      displayedSnapshot,
    ],
  );

  useEffect(() => {
    if (!flowInstance || !layout) return;
    const canvas = keyboardTargetRef.current;
    let frame = 0;

    const scheduleFit = () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        fitC4MapView(flowRef.current);
      });
    };

    scheduleFit();

    if (!canvas || !hasResizeObserver()) {
      return () => {
        if (frame !== 0) cancelAnimationFrame(frame);
      };
    }

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(canvas);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [flowInstance, layout]);

  useEffect(() => {
    const focusNodeId = softwareMapViewportFocusNodeId({
      nodes: flow?.nodes ?? [],
      viewportFocusNodeId,
    });

    const focused = focusNodeId
      ? flow?.nodes.find((node) => node.id === focusNodeId)
      : null;

    if (!focused) return;

    if (
      !softwareMapViewportFocusTargetReady({
        node: focused.data.node,
        viewportFocusNodeId,
        requireExpanded: viewportFocusRequiresExpanded,
      })
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (
        !focusC4MapNodeAndKeyboard(
          flowRef.current,
          focused,
          keyboardTargetRef.current,
        )
      ) {
        return;
      }

      if (viewportFocusNodeId === focused.id) {
        onViewportFocusComplete?.(focused.id);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [
    flowInstance,
    flow?.nodes,
    onViewportFocusComplete,
    viewportFocusNodeId,
    viewportFocusRequiresExpanded,
  ]);

  useLayoutEffect(() => {
    if (!displayedSnapshot.selectedNodeId) return;
    focusSoftwareMapKeyboardTarget(keyboardTargetRef.current);
  }, [displayedSnapshot.selectedNodeId, displayedSnapshot.view]);

  useLayoutEffect(() => {
    if (!shouldAutoFocusC4MapKeyboardTarget(interactionMode)) return;
    focusSoftwareMapKeyboardTarget(keyboardTargetRef.current);
  }, [flow, interactionMode]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return;

      if (
        isSoftwareMapEditableTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        fitC4MapView(flowRef.current);

        return;
      }

      const direction = c4SpatialDirectionForKey(event.key);

      if (direction) {
        event.preventDefault();
        event.stopPropagation();

        const nextId = findSpatialC4Node(
          displayedSnapshot.selectedNodeId,
          c4SpatialPositions(layout),
          direction,
        );

        const nextNode = nextId
          ? nodes.find((candidate) => candidate.id === nextId)
          : null;

        if (nextNode) {
          onSelectNode?.(nextNode);
          const flowNode = flow?.nodes.find((node) => node.id === nextNode.id);

          if (flowNode) {
            revealC4MapNode(
              flowRef.current,
              keyboardTargetRef.current,
              flowNode,
            );
          }
        }

        return;
      }

      if (event.key === "Enter") {
        const selected = displayedSnapshot.selectedNodeId
          ? nodes.find((node) => node.id === displayedSnapshot.selectedNodeId)
          : null;

        if (selected) {
          event.preventDefault();
          event.stopPropagation();
          drillNode(selected);
        }

        return;
      }

      if (event.key === "Tab") {
        const selected = softwareMapNodeForKeyboardExpansion({
          nodes,
          selectedNodeId: displayedSnapshot.selectedNodeId,
          focusedNodeId: softwareMapEventTargetNodeId(
            event.target,
            event.currentTarget,
          ),
        });

        if (selected) {
          event.preventDefault();
          event.stopPropagation();
          onToggleNodeExpansion?.(selected);
        }

        return;
      }

      if (event.key === "Escape") {
        const parentId = parentSoftwareMapNodeId({
          nodes,
          nodeId: displayedSnapshot.selectedNodeId,
        });

        const parent = parentId
          ? nodes.find((node) => node.id === parentId)
          : null;

        if (parent) {
          event.preventDefault();
          event.stopPropagation();
          onSelectNode?.(parent);
          onFocusNode?.(parent);
        }
      }
    },
    [
      layout,
      flow?.nodes,
      drillNode,
      nodes,
      onFocusNode,
      onSelectNode,
      onToggleNodeExpansion,
      displayedSnapshot.selectedNodeId,
    ],
  );

  const handleKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Tab") {
        handleKeyDown(event);
      }
    },
    [handleKeyDown],
  );

  // The class is the block tests' hook for a map still laying out.
  const codeStatusProps = {
    className: cn("software-map-code-status", styles.codeStatus),
  };

  return (
    // The class scopes the React Flow internals in global.css.
    <div
      ref={keyboardTargetRef}
      className={cn(
        "software-map-c4-canvas",
        styles.c4Canvas,
        lens && styles.c4CanvasLens,
      )}
      tabIndex={0}
      onKeyDownCapture={handleKeyDownCapture}
      onKeyDown={handleKeyDown}
    >
      <C4NodeMeasurementLayer
        nodes={measuredNodes}
        measurementKey={measurementKey}
        onMeasure={handleMeasuredNodes}
      />
      {layoutError ? (
        <div {...codeStatusProps}>Layout failed: {layoutError}</div>
      ) : (
        <>
          {layoutRefreshing ? (
            <div {...codeStatusProps}>Refreshing layout...</div>
          ) : null}
          {flow ? (
            <>
              <C4HoveredNodeContext.Provider value={hoveredNodeId}>
                <ReactFlow
                  className={styles.flow}
                  colorMode={theme}
                  proOptions={{ hideAttribution: true }}
                  nodes={flow.nodes}
                  edges={flow.edges}
                  nodeTypes={c4NodeTypes}
                  edgeTypes={c4EdgeTypes}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elevateNodesOnSelect={false}
                  elementsSelectable
                  panActivationKeyCode={null}
                  fitView
                  fitViewOptions={{ padding: C4_FIT_VIEW_PADDING }}
                  minZoom={C4_FLOW_MIN_ZOOM}
                  maxZoom={C4_FLOW_MAX_ZOOM}
                  panOnScroll={reactFlowInteractionProps.panOnScroll}
                  preventScrolling={reactFlowInteractionProps.preventScrolling}
                  zoomOnScroll={reactFlowInteractionProps.zoomOnScroll}
                  zoomOnPinch={reactFlowInteractionProps.zoomOnPinch}
                  zoomOnDoubleClick={false}
                  onInit={(instance) => {
                    flowRef.current = instance;
                    setFlowInstance(instance);
                  }}
                  onNodeClick={(_, node) => onSelectNode?.(node.data.node)}
                  onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
                  onNodeMouseLeave={(_, node) =>
                    setHoveredNodeId((currentNodeId) =>
                      currentNodeId === node.id ? null : currentNodeId,
                    )
                  }
                >
                  <Background
                    className={styles.background}
                    gap={24}
                    color="var(--canvas-grid)"
                  />
                  {expanded && (
                    <MiniMap
                      pannable
                      zoomable
                      position="top-right"
                      maskColor="var(--minimap-mask)"
                      maskStrokeColor="var(--rule-soft)"
                      maskStrokeWidth={1}
                      nodeColor={(node) =>
                        node.id === displayedSnapshot.selectedNodeId
                          ? "var(--minimap-node-selected)"
                          : "var(--minimap-node)"
                      }
                      nodeStrokeColor={(node) =>
                        node.id === displayedSnapshot.selectedNodeId
                          ? "var(--selection)"
                          : "var(--rule-soft)"
                      }
                      nodeBorderRadius={4}
                      style={{
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--rule)",
                        borderRadius: 10,
                      }}
                    />
                  )}
                  <Controls showInteractive={false} />
                </ReactFlow>
              </C4HoveredNodeContext.Provider>
            </>
          ) : (
            <div {...codeStatusProps}>Laying out software map...</div>
          )}
        </>
      )}
      <SoftwareMapHotkeysTab
        groups={C4_MAP_HOTKEY_GROUPS}
        activeGroupId="c4-navigation"
        open={hotkeysOpen}
        ariaLabel="Software map keyboard shortcuts"
        onOpenChange={setHotkeysOpen}
      />
    </div>
  );
}

function hasResizeObserver(): boolean {
  return typeof ResizeObserver !== "undefined";
}

function c4MeasurementKey(nodes: SoftwareMapNodeSnapshot[]) {
  return nodes
    .map((node) =>
      [
        node.id,
        node.label,
        node.type,
        node.dataStoreKind ?? "",
        node.changeStatus ?? "",
        node.description ?? "",
        node.file ?? "",
        node.line ?? "",
        node.boundary ? "boundary" : "",
        node.childCount ?? "",
        c4DataStoreSchemaSignature(node),
      ].join("\u001f"),
    )
    .join("\u001e");
}

function c4DimensionsEqual(
  left: ReadonlyMap<string, C4NodeDimensions> | null,
  right: ReadonlyMap<string, C4NodeDimensions>,
) {
  if (!left || left.size !== right.size) return false;

  for (const [id, rightDimensions] of right) {
    const leftDimensions = left.get(id);

    if (
      !leftDimensions ||
      leftDimensions.width !== rightDimensions.width ||
      leftDimensions.height !== rightDimensions.height
    ) {
      return false;
    }
  }

  return true;
}

function C4NodeMeasurementLayer({
  nodes,
  measurementKey,
  onMeasure,
}: {
  nodes: SoftwareMapNodeSnapshot[];
  measurementKey: string;
  onMeasure: (dimensions: ReadonlyMap<string, C4NodeDimensions>) => void;
}) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  useLayoutEffect(() => {
    const measuredNodes = nodesRef.current;

    if (measuredNodes.length === 0) {
      onMeasure(new Map());

      return;
    }

    const measure = () => {
      const dimensions = new Map<string, C4NodeDimensions>();

      for (const node of measuredNodes) {
        const element = refs.current.get(node.id);

        if (!element) return;
        const rect = element.getBoundingClientRect();
        dimensions.set(node.id, {
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
        });
      }

      onMeasure(dimensions);
    };

    return scheduleC4NodeMeasurements(measure);
  }, [measurementKey, onMeasure]);

  return (
    <div className={styles.measureLayer} aria-hidden="true">
      {nodes.map((node) => (
        <div
          key={node.id}
          ref={(element) => {
            if (element) {
              refs.current.set(node.id, element);
            } else {
              refs.current.delete(node.id);
            }
          }}
          className={cn(
            styles.measureNode,
            node.type === "dataStore" && styles.measureNodeStore,
            node.type === "codeElement" && styles.measureNodeCode,
          )}
        >
          <SoftwareMapNodeCard node={node} selected={false} measured />
        </div>
      ))}
    </div>
  );
}

function SoftwareMapC4Edge(
  props: ReactFlowEdgeProps<ReactFlowEdge<C4MapEdgeData>>,
) {
  const hoveredNodeId = useContext(C4HoveredNodeContext);
  const data = props.data;

  const label = data?.relationship.hideLabel
    ? undefined
    : (data?.label ?? data?.semanticKind);

  const points = c4EdgePointsFromSections(data?.sections);

  if (points.length < 2) return null;
  const path = c4PolylinePath(points);

  const endpointBubbles = c4EdgeEndpointBubbles(
    points,
    data?.relationship ?? { from: props.source },
    hoveredNodeId,
  );

  const labelPoint =
    data?.labelPoint ??
    c4EdgeLabelPoint(data?.labelPosition, data?.labelDimensions, points);

  const relationshipId = data?.relationshipId ?? props.id;

  const openRelationship = (
    event: ReactMouseEvent<Element> | ReactKeyboardEvent<Element>,
  ) => {
    if (!data?.onOpenRelationship) return;

    if (hasTextSelectionWithin(event.currentTarget)) {
      event.stopPropagation();

      return;
    }

    event.preventDefault();
    event.stopPropagation();
    data.onOpenRelationship(relationshipId);
  };

  return (
    <>
      {data?.operationState && data.operationState !== "inactive" ? (
        <path
          d={path}
          className={cn(
            styles.edgeHighlight,
            data.operationState === "active" && styles.edgeHighlightActive,
          )}
        />
      ) : null}
      <BaseEdge
        path={path}
        markerStart={props.markerStart}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={props.interactionWidth}
      />
      <path
        d={path}
        className={styles.edgeHitArea}
        onClick={openRelationship}
      />
      <EdgeLabelRenderer>
        {endpointBubbles.map((bubble) => (
          <span
            key={bubble.endpoint}
            aria-hidden="true"
            className={cn(
              styles.edgeEndpoint,
              bubble.hovered && styles.edgeEndpointHovered,
            )}
            data-endpoint={bubble.endpoint}
            style={{
              transform: `translate(-50%, -50%) translate(${bubble.x}px, ${bubble.y}px)`,
            }}
          />
        ))}
        <div
          className={cn("nodrag nopan", styles.edgeLabelAnchor)}
          style={{
            transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)`,
          }}
        >
          {label ? (
            data?.onOpenRelationship ? (
              <span
                role="button"
                tabIndex={0}
                className={cn(
                  styles.edgeLabel,
                  styles.edgeLabelButton,
                  data.selectedNodeAttached && styles.edgeLabelSelectedNode,
                )}
                data-review-anchor-id={relationshipId}
                onClick={openRelationship}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  openRelationship(event);
                }}
              >
                {label}
              </span>
            ) : (
              <span
                className={cn(
                  styles.edgeLabel,
                  data?.selectedNodeAttached && styles.edgeLabelSelectedNode,
                )}
              >
                {label}
              </span>
            )
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function c4PolylinePath(points: C4ElkPoint[]): string {
  const [first, ...rest] = points;

  if (!first) return "";

  return [
    `M ${first.x} ${first.y}`,
    ...rest.map((point) => `L ${point.x} ${point.y}`),
  ].join(" ");
}

function SoftwareMapC4GroupNode({
  data,
}: ReactFlowNodeProps<C4MapFlowGroupNode>) {
  return (
    <div
      data-selected={data.selected ? "true" : undefined}
      className={cn(
        styles.groupShell,
        data.node.changeStatus === "added" && styles.groupAdded,
        data.node.changeStatus === "removed" && styles.groupRemoved,
        data.node.changeStatus === "modified" && styles.groupModified,
        data.selected && styles.groupSelected,
      )}
      onClick={(event) => {
        if (hasTextSelectionWithin(event.currentTarget)) {
          event.stopPropagation();

          return;
        }

        event.preventDefault();
        event.stopPropagation();
        data.onSelect?.(data.node);
      }}
      onDoubleClickCapture={(event) => {
        if (hasTextSelectionWithin(event.currentTarget)) {
          event.stopPropagation();
        }
      }}
    >
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        className={styles.handle}
      />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        className={styles.handle}
      />
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        className={styles.handle}
      />
      <Handle
        id="source-top"
        type="source"
        position={Position.Top}
        className={styles.handle}
      />
      <div
        className={cn(
          styles.groupTitle,
          data.node.type === "softwareSystem" && styles.groupTitleSystem,
        )}
      >
        <span className={cn(textStyles.eyebrow, styles.groupKind)}>
          {softwareMapNodeTypeLabel(data.node)}
        </span>
        <strong
          className={cn(
            styles.groupLabel,
            data.node.type === "softwareSystem" && styles.groupLabelSystem,
            data.node.changeStatus === "removed" && styles.struck,
          )}
        >
          {data.node.label}
        </strong>
        <SoftwareMapChangeBadge
          status={data.node.changeStatus}
          additions={data.node.additions}
          deletions={data.node.deletions}
          inGroupTitle
        />
      </div>
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        className={styles.handle}
      />
      <Handle
        id="target-right"
        type="target"
        position={Position.Right}
        className={styles.handle}
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        className={styles.handle}
      />
      <Handle
        id="target-bottom"
        type="target"
        position={Position.Bottom}
        className={styles.handle}
      />
    </div>
  );
}

function SoftwareMapC4Node({ data }: ReactFlowNodeProps<C4MapFlowNode>) {
  return (
    <div
      className={cn("nodrag nopan", styles.nodeShell)}
      onDoubleClickCapture={(event) => {
        if (hasTextSelectionWithin(event.currentTarget)) {
          event.stopPropagation();

          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (data.node.expanded) {
          data.onCollapseNode?.(data.node);
        } else {
          data.onExpandNode?.(data.node);
        }
      }}
    >
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        className={styles.handle}
      />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        className={styles.handle}
      />
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        className={styles.handle}
      />
      <Handle
        id="source-top"
        type="source"
        position={Position.Top}
        className={styles.handle}
      />
      <SoftwareMapNodeCard
        node={data.node}
        selected={data.selected}
        onSelect={data.onSelect}
        onExpandNode={data.onExpandNode}
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        className={styles.handle}
      />
      <Handle
        id="target-right"
        type="target"
        position={Position.Right}
        className={styles.handle}
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        className={styles.handle}
      />
      <Handle
        id="target-bottom"
        type="target"
        position={Position.Bottom}
        className={styles.handle}
      />
    </div>
  );
}

// The outline and folder shapes stay hidden; the card draws the store.
function SoftwareMapDataStoreOutline({
  outline,
  selected,
  removed,
}: {
  outline: SoftwareMapDataStoreOutlineKind;
  selected: boolean;
  removed: boolean;
}) {
  if (outline === "folder") {
    return (
      <span aria-hidden="true" className={styles.storageFolder}>
        <span
          className={cn(
            styles.storageFolderBody,
            removed && styles.storageDashed,
            selected && styles.storageGlow,
          )}
        />
        <svg
          className={cn(
            styles.storageFolderTab,
            selected && styles.storageGlow,
          )}
          focusable="false"
          preserveAspectRatio="none"
          viewBox="0 0 190 48"
        >
          <path
            className={styles.storageFill}
            d="M2 46 V14 Q2 2 14 2 H148 L188 46 Z"
            vectorEffect="non-scaling-stroke"
          />
          <path
            className={cn(
              styles.storageBorder,
              removed && styles.storageDashed,
            )}
            d="M2 46 V14 Q2 2 14 2 H148 L188 46"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </span>
    );
  }

  const geometry = softwareMapDataStoreOutlineGeometry(outline);

  return (
    <svg
      aria-hidden="true"
      className={styles.storageOutline}
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 280 140"
    >
      <path
        className={styles.storageFill}
        d={geometry.fillPath}
        vectorEffect="non-scaling-stroke"
      />
      {geometry.fillDetailPath ? (
        <path
          className={styles.storageFillDetail}
          d={geometry.fillDetailPath}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <path
        className={cn(
          styles.storageSelection,
          selected && styles.storageSelectionSelected,
        )}
        d={geometry.outlinePath}
        vectorEffect="non-scaling-stroke"
      />
      <path
        className={cn(styles.storageBorder, removed && styles.storageDashed)}
        d={geometry.outlinePath}
        vectorEffect="non-scaling-stroke"
      />
      {geometry.detailPaths.map((path) => (
        <path
          className={styles.storageDetail}
          d={path}
          key={path}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function softwareMapDataStoreOutlineGeometry(
  outline: SoftwareMapDataStoreOutlineKind,
) {
  if (outline === "bucket") {
    return {
      fillPath: "M18 24 C18 12 262 12 262 24 L238 118 C236 130 44 130 42 118 Z",
      fillDetailPath: "M18 24 C18 12 262 12 262 24 C262 36 18 36 18 24 Z",
      outlinePath:
        "M18 24 C18 12 262 12 262 24 L238 118 C236 130 44 130 42 118 Z",
      detailPaths: [
        "M18 24 C18 36 262 36 262 24",
        "M42 118 C42 130 238 130 238 118",
      ],
    };
  }

  return {
    fillPath: "M8 22 C8 34 272 34 272 22 L272 116 C272 128 8 128 8 116 Z",
    fillDetailPath: "M8 22 C8 10 272 10 272 22 C272 34 8 34 8 22 Z",
    outlinePath:
      "M8 22 C8 10 272 10 272 22 L272 116 C272 128 8 128 8 116 L8 22",
    detailPaths: ["M8 22 C8 34 272 34 272 22", "M8 116 C8 128 272 128 272 116"],
  };
}

function SoftwareMapNodeFrame({
  node,
  selected,
  measured = false,
  as: Element = "div",
  children,
  onSelect,
  onExpandNode,
}: {
  node: SoftwareMapNodeSnapshot;
  selected: boolean;
  /** Rendered off screen to measure, rather than on the canvas. */
  measured?: boolean;
  as?: "button" | "div";
  children?: ReactNode;
  onSelect?: (node: SoftwareMapNodeSnapshot) => void;
  onExpandNode?: (node: SoftwareMapNodeSnapshot) => void;
}) {
  const isCodeElement = node.type === "codeElement";
  const isDataStore = node.type === "dataStore";
  const isCollection = node.type === "dataStoreCollection";

  const dataStoreOutline = isDataStore
    ? softwareMapDataStoreOutlineKind(node.dataStoreKind)
    : undefined;

  const hasExpandedDataStoreSchema =
    (isDataStore || isCollection) &&
    Boolean(node.dataStoreSchemaSections?.length);

  const status =
    node.changeStatus && node.changeStatus !== "unchanged"
      ? node.changeStatus
      : undefined;

  // A data store's children stack above its storage shape.
  const layer = isDataStore && styles.storeLayer;

  const codeRing = selected ? "selected" : status;

  const props = {
    "data-selected": selected ? "true" : undefined,
    ...{
      className: cn(
        "nodrag nopan",
        styles.node,
        isCollection && styles.nodeTight,
        isCodeElement && styles.nodeCode,
        isDataStore && styles.nodeStore,
        isDataStore && measured && !status && styles.nodeStoreHoverable,
        measured && styles.nodeMeasured,
        measured && isDataStore && styles.nodeMeasuredStore,
        measured && isCodeElement && styles.nodeMeasuredCode,
        status && nodeStatusStyles[status],
        selected && styles.nodeSelected,
        isDataStore &&
          !measured &&
          (status || selected) &&
          styles.nodeStoreMarked,
        isDataStore && selected && storeSelectedStyles[status ?? "unchanged"],
        isCodeElement && codeRing && codeRingStyles[codeRing],
      ),
    },
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
      if (hasTextSelectionWithin(event.currentTarget)) {
        event.stopPropagation();

        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onSelect?.(node);
    },
    onDoubleClick: (event: ReactMouseEvent<HTMLElement>) => {
      if (hasTextSelectionWithin(event.currentTarget)) {
        event.stopPropagation();

        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onExpandNode?.(node);
    },
  };

  return (
    <Element
      {...props}
      {...(Element === "button"
        ? {
            type: "button",
            "aria-label": `${softwareMapNodeTypeLabel(node)}: ${node.label}`,
          }
        : {
            role: "group",
            "aria-label": `${softwareMapNodeTypeLabel(node)}: ${node.label}`,
          })}
    >
      {dataStoreOutline ? (
        <SoftwareMapDataStoreOutline
          outline={dataStoreOutline}
          selected={selected}
          removed={status === "removed"}
        />
      ) : null}
      {isCodeElement ? (
        <div className={styles.codeHead}>
          <code
            className={cn(
              styles.codeLabel,
              status === "removed" && styles.struck,
            )}
          >
            {node.label}
          </code>
          <SoftwareMapChangeBadge
            status={node.changeStatus}
            additions={node.additions}
            deletions={node.deletions}
          />
        </div>
      ) : (
        <>
          <div
            className={cn(styles.kicker, layer, isCollection && styles.hidden)}
          >
            <div className={cn(textStyles.eyebrow, styles.nodeType)}>
              {softwareMapNodeTypeLabel(node)}
            </div>
            <SoftwareMapChangeBadge
              status={node.changeStatus}
              additions={node.additions}
              deletions={node.deletions}
            />
          </div>
          <h4
            className={cn(
              styles.label,
              hasExpandedDataStoreSchema && styles.labelWithSchema,
              status === "removed" && styles.struck,
              layer,
              isCollection && styles.hidden,
            )}
          >
            {node.label}
          </h4>
        </>
      )}
      {!isCodeElement && node.description && (
        <p
          className={cn(
            styles.description,
            layer,
            (isCollection || hasExpandedDataStoreSchema) && styles.hidden,
          )}
        >
          {node.description}
        </p>
      )}
      {!isCodeElement && (
        <div
          className={cn(
            styles.meta,
            layer,
            (isCollection || hasExpandedDataStoreSchema) && styles.hidden,
          )}
        >
          {node.file && (
            <span className={styles.metaItem}>
              {node.file}
              {node.line === undefined ? "" : `:L${node.line}`}
            </span>
          )}
          {node.childCount !== undefined && node.childCount > 0 && (
            <span className={styles.metaItem}>{node.childCount} children</span>
          )}
          {node.boundary && <span className={styles.metaItem}>boundary</span>}
        </div>
      )}
      {children}
      {hasExpandedDataStoreSchema && (
        <SoftwareMapDataStoreSchema
          sections={node.dataStoreSchemaSections ?? []}
          collection={isCollection}
          selected={selected}
        />
      )}
    </Element>
  );
}

function SoftwareMapDataStoreSchema({
  sections,
  collection,
  selected,
}: {
  sections: SoftwareMapDataStoreSchemaSectionSnapshot[];
  collection: boolean;
  selected: boolean;
}) {
  return (
    <div className={cn(styles.schema, collection && styles.schemaFlush)}>
      {sections.map((section) => (
        <section
          key={section.id}
          className={cn(
            styles.schemaSection,
            collection && selected && styles.schemaSectionSelected,
          )}
        >
          <header className={styles.schemaHeader}>
            <span className={styles.schemaKind}>{section.kind}</span>
            <strong className={styles.schemaLabel}>{section.label}</strong>
          </header>
          {section.key && <div className={styles.schemaKey}>{section.key}</div>}
          <div>
            {section.rows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  styles.schemaRow,
                  row.primaryKey && styles.schemaRowPrimary,
                  row.state === "active" && styles.schemaRowActive,
                )}
                style={
                  // SAFETY: React passes "--*" keys through to
                  // style.setProperty; CSSProperties only lacks an index
                  // signature for custom properties.
                  {
                    "--software-map-schema-row-depth": row.depth ?? 0,
                  } as CSSProperties
                }
              >
                <span className={styles.schemaRowName}>
                  {row.primaryKey && (
                    <Chip className={styles.schemaKeyFlag}>PK</Chip>
                  )}
                  {row.foreignKey && (
                    <Chip
                      className={[
                        styles.schemaKeyFlag,
                        styles.schemaKeyFlagForeign,
                      ]}
                    >
                      FK
                    </Chip>
                  )}
                  {row.label}
                </span>
                <span className={styles.schemaRowType}>
                  {row.type ?? row.example ?? "object"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SoftwareMapNodeCard({
  node,
  selected,
  measured,
  onSelect,
  onExpandNode,
}: {
  node: SoftwareMapNodeSnapshot;
  selected: boolean;
  measured?: boolean;
  onSelect?: (node: SoftwareMapNodeSnapshot) => void;
  onExpandNode?: (node: SoftwareMapNodeSnapshot) => void;
}) {
  return (
    <SoftwareMapNodeFrame
      node={node}
      selected={selected}
      measured={measured}
      onSelect={onSelect}
      onExpandNode={onExpandNode}
    />
  );
}

function SoftwareMapChangeBadge({
  status,
  additions,
  deletions,
  inGroupTitle = false,
}: {
  status?: SoftwareChangeStatus;
  additions?: number;
  deletions?: number;
  /** A group's title sets its counts as quiet capitals, pushed right. */
  inGroupTitle?: boolean;
}) {
  const visibleAdditions = visibleSoftwareMapChangeCount(additions);
  const visibleDeletions = visibleSoftwareMapChangeCount(deletions);
  const hasCounts = Boolean(visibleAdditions || visibleDeletions);
  const hasChangeStatus = Boolean(status && status !== "unchanged");

  if (!hasCounts && !hasChangeStatus) return null;

  if (!hasCounts) {
    return (
      <span
        className={cn(
          styles.badge,
          inGroupTitle && styles.badgeInGroup,
          styles.badgeEmpty,
        )}
        aria-hidden="true"
      />
    );
  }

  return (
    <span className={cn(styles.badge, inGroupTitle && styles.badgeInGroup)}>
      {visibleAdditions ? (
        <span
          className={cn(
            styles.count,
            styles.countAdded,
            inGroupTitle && styles.countInGroup,
          )}
        >
          +{visibleAdditions}
        </span>
      ) : null}
      {visibleDeletions ? (
        <span
          className={cn(
            styles.count,
            styles.countRemoved,
            inGroupTitle && styles.countInGroup,
          )}
        >
          -{visibleDeletions}
        </span>
      ) : null}
    </span>
  );
}

function createPlaceholderSnapshot(
  title: string,
  view?: string,
): SoftwareMapResolvedSnapshot {
  return {
    title,
    view: view ?? "unresolved",
    viewType: "inlineC4",
    selectedNodeId: "placeholder-component",
    nodes: [
      {
        id: "placeholder-system",
        label: "Authored model",
        type: "softwareSystem",
        description:
          "MDX defines systems, containers, components, and relationships.",
      },
      {
        id: "placeholder-component",
        label: "Resolved snapshot",
        type: "component",
        parentId: "placeholder-system",
        description: "The Vite resolver will provide normalized map nodes.",
      },
      {
        id: "placeholder-code",
        label: "Code element",
        type: "codeElement",
        parentId: "placeholder-component",
        description: "Code cards will reuse the source-card renderer later.",
        childCount: 0,
      },
      {
        id: "placeholder-boundary",
        label: "Boundary node",
        type: "component",
        description:
          "Outside-scope relationships can render as boundary nodes.",
        boundary: true,
      },
    ],
    relationships: [
      {
        from: "placeholder-component",
        to: "placeholder-code",
        label: "contains",
        kind: "semantic",
      },
      {
        from: "placeholder-code",
        to: "placeholder-boundary",
        label: "calls",
        kind: "call",
      },
    ],
  };
}

const styles = {
  // The expanded map: a fixed layer over the canvas. The layer variable lives
  // on .review-app, outside this portal, so the fallback keeps it above the
  // sticky topbar.
  overlay:
    "tw:fixed tw:inset-0 tw:z-[var(--review-debug-layer,_2147483000)] tw:grid tw:box-border tw:min-w-0 tw:min-h-0 tw:overflow-hidden tw:p-0 tw:bg-[color:var(--bg)]",
  frame:
    "tw:relative tw:grid tw:grid-rows-[auto_minmax(0,_1fr)] tw:h-[var(--software-map-height,_520px)] tw:min-h-[340px] tw:m-0 tw:overflow-hidden tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[8px] tw:bg-[color:var(--surface)] tw:[box-shadow:none] tw:font-[family-name:var(--font-sans)]",
  frameExpanded:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:box-border tw:w-full tw:h-full tw:min-w-0 tw:min-h-0",
  frameChromeHidden:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:grid-rows-[minmax(0,_1fr)] tw:rounded-none",
  frameView: "tw:h-full tw:bg-[color:var(--bg)]",
  frameLens: "tw:h-full tw:min-h-0 tw:bg-[color:var(--transparent)]",
  header:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:flex tw:justify-between tw:gap-[16px] tw:min-w-0 tw:items-center tw:min-h-[36px] tw:p-[0_12px] tw:bg-[color:var(--transparent)] tw:[box-shadow:none] tw:font-[family-name:var(--font-sans)]",
  titleBlock: "tw:relative",
  kindBadge: "tw:min-w-0",
  title: "tw:m-0 tw:text-[length:13px] tw:font-semibold",
  actions: "tw:flex tw:flex-[0_0_auto] tw:items-center tw:min-w-0 tw:gap-[4px]",
  floatingActions:
    "tw:absolute tw:top-[10px] tw:right-[10px] tw:z-[20] tw:flex tw:[&:is(.canvas-app[data-peek-open]_*)]:hidden tw:gap-[8px] tw:p-[2px] tw:rounded-[8px]",
  refreshing: "tw:text-[color:var(--accent)]",
  // Shows while the pointer is over the map.
  expandButton:
    "tw:opacity-0 tw:[&:focus-visible]:opacity-[1] tw:[&:is(.canvas-map-frame:hover_*)]:opacity-[1] tw:[transition:opacity_120ms_ease,_color_120ms_ease]",
  // Two corner brackets.
  expandIcon:
    "tw:relative tw:block tw:size-[14px] tw:[&::before]:absolute tw:[&::before]:top-0 tw:[&::before]:right-0 tw:[&::before]:w-[7px] tw:[&::before]:h-[7px] tw:[&::before]:[border-top-width:2px] tw:[&::before]:[border-top-style:solid] tw:[&::before]:[border-top-color:currentColor] tw:[&::before]:[border-right-width:2px] tw:[&::before]:[border-right-style:solid] tw:[&::before]:[border-right-color:currentColor] tw:[&::before]:[content:''] tw:[&::after]:absolute tw:[&::after]:bottom-0 tw:[&::after]:left-0 tw:[&::after]:w-[7px] tw:[&::after]:h-[7px] tw:[&::after]:[border-bottom-width:2px] tw:[&::after]:[border-bottom-style:solid] tw:[&::after]:[border-bottom-color:currentColor] tw:[&::after]:[border-left-width:2px] tw:[&::after]:[border-left-style:solid] tw:[&::after]:[border-left-color:currentColor] tw:[&::after]:[content:'']",
  body: "tw:grid tw:min-w-0 tw:min-h-0 tw:overflow-hidden",
  // Narrow layouts stack the inspector under the map, then float it over.
  bodyWithInspector:
    "tw:[@media_(max-width:_720px)]:relative tw:[@media_(max-width:_900px)]:grid-rows-[minmax(0,_1fr)_minmax(220px,_42%)] tw:[@media_(max-width:_720px)]:grid-rows-[minmax(0,_1fr)] tw:grid-cols-[minmax(0,_1fr)_10px_var(--software-map-inspector-width,_420px)] tw:[@media_(max-width:_900px)]:grid-cols-[minmax(0,_1fr)] tw:[@media_(max-width:_720px)]:grid-cols-[minmax(0,_1fr)]",
  bodyResizing: "tw:[cursor:col-resize] tw:select-none",
  canvas:
    "tw:relative tw:grid tw:min-w-0 tw:min-h-0 tw:overflow-hidden tw:p-0 tw:bg-[color:var(--bg)] tw:font-[family-name:var(--font-sans)]",
  status:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:absolute tw:top-[14px] tw:left-[14px] tw:z-[8] tw:w-max tw:max-w-[min(420px,_calc(100%_-_28px))] tw:m-0 tw:p-[8px_10px] tw:rounded-[8px] tw:bg-[color:var(--transparent)] tw:[box-shadow:none] tw:text-[color:var(--ink-muted)] tw:text-[length:12px] tw:leading-[17px]",
  statusError:
    "tw:border-[color:var(--diff-removed)] tw:bg-[color:var(--diff-removed-bg)] tw:text-[color:var(--diff-removed)]",
  inspectorResizer:
    "tw:z-[8] tw:min-h-0 tw:[@media_(max-width:_900px)]:hidden tw:[@container_review-canvas_(max-width:_929px)]:[&:is(.canvas-app[data-peek-open]_*)]:hidden tw:[@media_(max-width:_720px)]:[&:is(.canvas-app[data-peek-open]_*)]:hidden",
  inspectorBackdrop:
    "tw:hidden tw:[@media_(max-width:_720px)]:block tw:[@media_(max-width:_720px)]:absolute tw:[@media_(max-width:_720px)]:inset-0 tw:[@media_(max-width:_720px)]:z-[48] tw:[@media_(max-width:_720px)]:p-0 tw:[@media_(max-width:_720px)]:border-[0] tw:[@media_(max-width:_720px)]:border-none tw:[@media_(max-width:_720px)]:border-[color:currentcolor] tw:[@media_(max-width:_720px)]:bg-[color:var(--backdrop)]",
  inspector:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:[@media_(max-width:_720px)]:absolute tw:[@media_(max-width:_720px)]:right-[8px] tw:[@media_(max-width:_720px)]:bottom-[8px] tw:[@media_(max-width:_720px)]:left-[8px] tw:[@media_(max-width:_720px)]:z-[49] tw:grid tw:grid-rows-[auto_minmax(0,_1fr)] tw:min-w-0 tw:[@media_(max-width:_720px)]:h-[min(72%,_560px)] tw:min-h-0 tw:[@media_(max-width:_720px)]:min-h-[240px] tw:overflow-hidden tw:[@media_(max-width:_720px)]:rounded-[10px] tw:bg-[color:var(--bg)] tw:[box-shadow:none]",
  inspectorHeader:
    "tw:[@media_(max-width:_720px)]:sticky tw:[@media_(max-width:_720px)]:top-0 tw:[@media_(max-width:_720px)]:z-[2] tw:flex tw:gap-[10px] tw:items-center tw:justify-between tw:min-w-0 tw:p-[7px_8px_3px] tw:[@media_(max-width:_720px)]:p-[8px] tw:[@media_(max-width:_720px)]:[border-bottom-width:1px] tw:[@media_(max-width:_720px)]:[border-bottom-style:solid] tw:[@media_(max-width:_720px)]:[border-bottom-color:var(--rule)] tw:bg-[color:var(--bg)]",
  inspectorTitle:
    "tw:flex tw:gap-[8px] tw:items-baseline tw:min-w-0 tw:pl-[4px] tw:whitespace-nowrap",
  inspectorKind: "tw:flex-[none] tw:leading-[14px]",
  inspectorLabel:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--ink)] tw:text-[length:13px] tw:font-semibold tw:leading-[18px] tw:text-ellipsis",
  inspectorActions: "tw:flex tw:flex-[none] tw:gap-[4px] tw:items-center",
  codicon: "tw:text-[length:15px]",
  inspectorDiffs:
    "tw:min-h-0 tw:overflow-auto tw:bg-[color:var(--bg)] tw:[scrollbar-color:var(--rule-soft)_var(--surface)]",
  inspectorEmpty: "tw:px-[16px]",
  c4Canvas:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:relative tw:w-full tw:h-full tw:min-h-0 tw:overflow-hidden tw:rounded-none tw:bg-[color:var(--bg)] tw:font-[family-name:var(--font-sans)]",
  c4CanvasLens: "tw:min-w-0",
  flow: "tw:bg-[color:var(--bg)] tw:font-[family-name:var(--font-sans)]",
  background: "tw:opacity-[0.45]",
  // React Flow's node wrapper. Its text reads like the prose around it.
  flowNode:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:bg-[color:var(--transparent)] tw:[box-shadow:none] tw:[transition:transform_200ms_cubic-bezier(0.2,_0.8,_0.2,_1),_width_200ms_cubic-bezier(0.2,_0.8,_0.2,_1),_height_200ms_cubic-bezier(0.2,_0.8,_0.2,_1),_opacity_200ms_ease] tw:select-text",
  flowEdge: "tw:z-[1]",
  codeStatus:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:absolute tw:right-[14px] tw:bottom-[14px] tw:z-[8] tw:max-w-[min(380px,_calc(100%_-_28px))] tw:p-[8px_10px] tw:rounded-[8px] tw:bg-[color:var(--transparent)] tw:[box-shadow:none] tw:text-[color:var(--ink-muted)] tw:text-[length:12px] tw:leading-[17px]",
  edgeHighlight:
    "tw:fill-[none] tw:[stroke-linecap:round] tw:[stroke-linejoin:round] tw:pointer-events-none",
  edgeHighlightActive: "tw:stroke-[var(--selection-shadow)] tw:stroke-[10px]",
  edgeHitArea:
    "tw:fill-[none] tw:stroke-[var(--transparent)] tw:stroke-[18px] tw:[pointer-events:stroke]",
  edgeEndpoint:
    "tw:absolute tw:z-[39] tw:box-border tw:size-[11px] tw:border-[1.5px] tw:border-solid tw:border-[color:var(--ink-faint)] tw:rounded-[999px] tw:bg-[color:var(--surface)] tw:opacity-[1] tw:pointer-events-none",
  edgeEndpointHovered:
    "tw:border-[2px] tw:border-[color:var(--surface)] tw:bg-[color:var(--accent)]",
  edgeLabelAnchor:
    "tw:absolute tw:z-[40] tw:inline-flex tw:items-center tw:justify-center tw:min-w-[20px] tw:min-h-[20px] tw:[pointer-events:all]",
  edgeLabel:
    "tw:box-border tw:max-w-[132px] tw:p-[4px_10px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[8px] tw:bg-[color:var(--surface)] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-medium tw:tracking-[0] tw:leading-[15px] tw:text-center tw:whitespace-normal tw:[overflow-wrap:anywhere]",
  edgeLabelButton: "tw:cursor-pointer",
  edgeLabelSelectedNode: "tw:border-[color:var(--accent)]",
  // Off screen, so the layout can size each card before placing it.
  measureLayer:
    "tw:absolute tw:top-0 tw:left-[-10000px] tw:z-[-1] tw:w-[280px] tw:invisible tw:pointer-events-none",
  measureNode: "tw:w-max tw:min-w-[188px] tw:max-w-[340px] tw:mb-[16px]",
  measureNodeStore: "tw:w-[280px] tw:max-w-[280px]",
  measureNodeCode: "tw:w-max tw:min-w-0 tw:max-w-none",
  nodeShell:
    "tw:relative tw:w-full tw:h-full tw:[animation-name:-software-map-card-bloom] tw:[animation-duration:200ms] tw:[animation-timing-function:cubic-bezier(0.2,_0.8,_0.2,_1)]",
  groupShell:
    "tw:relative tw:box-border tw:w-full tw:h-full tw:p-[14px_16px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:[&:hover]:border-[color:var(--rule-soft)] tw:[&:focus-visible]:border-[color:var(--rule-soft)] tw:rounded-[10px] tw:bg-[color:var(--surface)] tw:[&:hover]:bg-[color:var(--marker-tint)] tw:[&:focus-visible]:bg-[color:var(--marker-tint)] tw:[box-shadow:none] tw:[&:hover]:[outline:none] tw:[&:focus-visible]:[outline:none] tw:cursor-pointer tw:font-[family-name:var(--font-sans)] tw:[animation-name:-software-map-group-bloom] tw:[animation-duration:200ms] tw:[animation-timing-function:cubic-bezier(0.2,_0.8,_0.2,_1)]",
  // Hover outranks a change's border; selection outranks hover.
  groupAdded:
    "tw:border-[color:var(--change-added)] tw:[&:hover]:border-[color:var(--rule-soft)] tw:[&:focus-visible]:border-[color:var(--rule-soft)]",
  groupRemoved:
    "tw:border-dashed tw:[&:hover]:border-solid tw:[&:focus-visible]:border-solid tw:border-[color:var(--change-removed)] tw:[&:hover]:border-[color:var(--rule-soft)] tw:[&:focus-visible]:border-[color:var(--rule-soft)] tw:opacity-[0.75]",
  groupModified:
    "tw:border-[color:var(--change-modified)] tw:[&:hover]:border-[color:var(--rule-soft)] tw:[&:focus-visible]:border-[color:var(--rule-soft)]",
  groupSelected:
    "tw:border-solid tw:border-[color:var(--accent)] tw:bg-[color:var(--marker-tint)] tw:[box-shadow:0_0_0_3px_var(--marker-glow)]",
  groupTitle:
    "tw:absolute tw:top-[14px] tw:right-[16px] tw:left-[16px] tw:flex tw:gap-[8px] tw:items-baseline tw:min-w-0 tw:text-[color:var(--ink-muted)] tw:tracking-[0] tw:pointer-events-auto tw:select-text",
  groupTitleSystem: "tw:top-[18px] tw:right-[22px] tw:left-[22px]",
  groupKind: "tw:flex-[0_0_auto]",
  groupLabel:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--ink)] tw:text-[length:13px] tw:font-semibold tw:text-ellipsis tw:whitespace-nowrap",
  groupLabelSystem: "tw:text-[length:15px]",
  struck: "tw:[text-decoration-line:line-through]",
  hidden: "tw:hidden",
  handle:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:size-[1px] tw:bg-[color:var(--transparent)] tw:opacity-0 tw:pointer-events-none",
  node: "tw:relative tw:box-border tw:grid tw:gap-[7px] tw:w-full tw:max-w-none tw:min-h-[104px] tw:p-[12px_14px] tw:border-[1px] tw:border-solid tw:border-[color:var(--rule-soft)] tw:rounded-[10px] tw:bg-[color:var(--surface)] tw:[&:hover]:bg-[color:var(--marker-tint)] tw:[&:focus-visible]:bg-[color:var(--marker-tint)] tw:[box-shadow:none] tw:[&:hover]:[outline:none] tw:[&:focus-visible]:[outline:none] tw:[&:hover]:[transform:translateY(-1px)] tw:[&:focus-visible]:[transform:translateY(-1px)] tw:appearance-none tw:text-[color:var(--ink)] tw:cursor-pointer tw:font-[family-name:inherit] tw:text-[length:inherit] tw:font-[number:inherit] tw:leading-[inherit] tw:[font-style:inherit] tw:font-[family-name:var(--font-sans)] tw:text-left tw:[transition:border-color_120ms_ease,_background_120ms_ease,_box-shadow_120ms_ease,_transform_120ms_ease]",
  nodeTight: "tw:gap-0",
  // A code card draws its ring inset, above its content.
  nodeCode:
    "tw:gap-0 tw:[&::before]:absolute tw:[&::before]:inset-0 tw:[&::before]:z-[2] tw:[&::before]:hidden tw:[&::before]:rounded-[inherit] tw:[&::before]:[box-shadow:inset_0_0_0_0.75px_var(--rule)] tw:[&::before]:[content:''] tw:[&::before]:pointer-events-none",
  nodeStore:
    "tw:isolate tw:[--software-map-storage-fill:var(--surface)] tw:[--software-map-storage-border:var(--rule-soft)] tw:[--software-map-storage-detail:var(--rule)] tw:[--software-map-storage-fill-detail:var(--transparent)]",
  nodeStoreHoverable:
    "tw:[--software-map-storage-border:var(--rule-soft)] tw:[&:hover]:[--software-map-storage-border:var(--map-storage-border)] tw:[&:focus-visible]:[--software-map-storage-border:var(--map-storage-border)]",
  nodeMeasured: "tw:w-max tw:min-w-[188px] tw:max-w-[340px] tw:min-h-0",
  nodeMeasuredStore: "tw:w-full tw:max-w-none tw:min-h-[104px]",
  nodeMeasuredCode: "tw:w-max tw:min-w-0",
  nodeSelected:
    "tw:border-solid tw:border-[color:var(--accent)] tw:bg-[color:var(--marker-tint)] tw:[box-shadow:0_0_0_3px_var(--marker-glow)]",
  nodeStoreMarked:
    "tw:border-[0] tw:border-[color:var(--transparent)] tw:bg-[color:var(--transparent)] tw:[&:hover]:bg-[color:var(--marker-tint)] tw:[&:focus-visible]:bg-[color:var(--marker-tint)] tw:[box-shadow:none]",
  storeLayer: "tw:relative tw:z-[1]",
  kicker: "tw:flex tw:gap-[8px] tw:items-center tw:justify-between tw:min-w-0",
  nodeType:
    "tw:min-w-0 tw:overflow-hidden tw:leading-[14px] tw:text-ellipsis tw:whitespace-nowrap",
  label:
    "tw:m-0 tw:text-[color:var(--ink)] tw:text-[length:15px] tw:font-semibold tw:leading-[19px]",
  labelWithSchema: "tw:leading-[16px]",
  // In a document the description reads as a document paragraph.
  description:
    "tw:m-0 tw:[&:is(.canvas-document:is(*)_*)]:m-[14px_0] tw:text-[color:var(--ink-muted)] tw:[&:is(.canvas-document:is(*)_*)]:font-[family-name:var(--font-sans)] tw:text-[length:12px] tw:font-normal tw:leading-[17px]",
  meta: "tw:flex tw:flex-wrap tw:gap-[5px] tw:items-center tw:min-w-0",
  metaItem:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:max-w-full tw:overflow-hidden tw:p-0 tw:rounded-none tw:bg-[color:var(--transparent)] tw:text-[color:var(--ink-faint)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-normal tw:leading-[15px] tw:text-ellipsis tw:whitespace-nowrap",
  codeHead:
    "tw:flex tw:gap-[8px] tw:items-center tw:w-max tw:max-w-full tw:min-w-0",
  // A document's code chip keeps its own padding and wash here.
  codeLabel:
    "tw:block tw:flex-[0_1_auto] tw:min-w-0 tw:overflow-hidden tw:[&:is(.canvas-document:is(*)_*)]:p-[2px_5px] tw:[&:is(.canvas-document:is(*)_*)]:rounded-[6px] tw:[&:is(.canvas-document:is(*)_*)]:bg-[color:var(--well)] tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-mono)] tw:text-[length:15px] tw:font-semibold tw:leading-[18px] tw:text-ellipsis tw:whitespace-nowrap",
  // Counts sit in the title row as plain text: the one +n −n pair, no pill.
  badge:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:inline-flex tw:flex-[0_0_auto] tw:items-center tw:justify-end tw:gap-[6px] tw:w-auto tw:max-w-[140px] tw:min-h-0 tw:overflow-hidden tw:p-0 tw:bg-[color:var(--transparent)] tw:font-[family-name:var(--font-sans)] tw:text-[length:11px] tw:font-medium tw:leading-[15px] tw:text-ellipsis tw:whitespace-nowrap",
  badgeEmpty: "tw:invisible",
  badgeInGroup:
    "tw:ml-[auto] tw:text-[color:var(--ink-faint)] tw:text-[length:10px] tw:tracking-[0.08em] tw:uppercase",
  count: "tw:min-w-0 tw:overflow-hidden tw:font-medium tw:text-ellipsis",
  countAdded: "tw:text-[color:var(--diff-added)]",
  countRemoved: "tw:text-[color:var(--diff-removed)]",
  countInGroup:
    "tw:flex-[0_0_auto] tw:text-[color:var(--ink-faint)] tw:text-[length:10px] tw:tracking-[0.08em] tw:uppercase",
  storageOutline:
    "tw:absolute tw:inset-0 tw:z-0 tw:hidden tw:w-full tw:h-full tw:overflow-visible tw:pointer-events-none",
  storageFill: "tw:fill-[var(--software-map-storage-fill)] tw:stroke-[none]",
  storageFillDetail:
    "tw:fill-[var(--software-map-storage-fill-detail)] tw:stroke-[none]",
  storageSelection:
    "tw:fill-[none] tw:stroke-[var(--transparent)] tw:[stroke-linejoin:round] tw:stroke-[7px]",
  storageSelectionSelected: "tw:stroke-[var(--selection)]",
  storageBorder:
    "tw:fill-[none] tw:stroke-[var(--software-map-storage-border)] tw:[stroke-linejoin:round] tw:stroke-[2px]",
  storageDetail:
    "tw:fill-[none] tw:stroke-[var(--software-map-storage-detail)] tw:[stroke-linejoin:round] tw:stroke-[1.25px]",
  storageDashed: "tw:[stroke-dasharray:7_5]",
  storageGlow:
    "tw:[filter:drop-shadow(0_0_0_var(--selection))_drop-shadow(0_0_3px_var(--selection))]",
  storageFolder:
    "tw:absolute tw:inset-0 tw:z-0 tw:hidden tw:pointer-events-none tw:[&::after]:absolute tw:[&::after]:top-[46px] tw:[&::after]:right-[10px] tw:[&::after]:left-[min(190px,_68%)] tw:[&::after]:[border-top-width:2px] tw:[&::after]:[border-top-style:solid] tw:[&::after]:[border-top-color:var(--software-map-storage-border)] tw:[&::after]:[content:'']",
  storageFolderBody:
    "tw:absolute tw:top-[46px] tw:right-0 tw:bottom-0 tw:left-0 tw:border-[0_2px_2px] tw:[border-style:none_solid_solid] tw:border-[color:currentcolor_var(--software-map-storage-border)_var(--software-map-storage-border)] tw:rounded-[0_10px_10px_10px] tw:bg-[color:var(--software-map-storage-fill)]",
  storageFolderTab:
    "tw:absolute tw:top-0 tw:left-0 tw:w-[min(190px,_68%)] tw:h-[48px] tw:overflow-visible",
  schema: "tw:relative tw:z-[1] tw:grid tw:gap-[8px] tw:m-[12px_-2px_0]",
  schemaFlush: "tw:m-0",
  schemaSection:
    "tw:overflow-hidden tw:border-[1px] tw:border-solid tw:border-[color:var(--rule)] tw:rounded-[6px] tw:bg-[color:var(--surface)]",
  schemaSectionSelected:
    "tw:border-[color:var(--selection)] tw:[box-shadow:none]",
  schemaHeader:
    "tw:grid tw:grid-cols-[auto_minmax(0,_1fr)] tw:items-center tw:gap-[8px] tw:p-[7px_10px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:bg-[color:var(--tray)] tw:text-left",
  schemaKind:
    "tw:text-[color:var(--ink-faint)] tw:font-[family-name:var(--font-sans)] tw:text-[length:10px] tw:font-bold tw:leading-[12px] tw:tracking-[0.08em] tw:uppercase",
  schemaLabel:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-mono)] tw:text-[length:12px] tw:leading-[15px] tw:text-ellipsis tw:whitespace-nowrap",
  schemaKey:
    "tw:overflow-hidden tw:p-[7px_10px] tw:[border-bottom-width:1px] tw:[border-bottom-style:solid] tw:[border-bottom-color:var(--rule)] tw:bg-[color:var(--tray)] tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-mono)] tw:text-[length:11px] tw:text-ellipsis tw:whitespace-nowrap",
  schemaRow:
    "tw:grid tw:grid-cols-[minmax(0,_1fr)_minmax(68px,_auto)] tw:items-center tw:gap-[10px] tw:h-[30px] tw:p-[0_10px_0_calc(12px_+_var(--software-map-schema-row-depth,_0)_*_18px)] tw:[border-bottom-width:1px] tw:[&:last-child]:[border-bottom-width:0] tw:[border-bottom-style:solid] tw:[&:last-child]:[border-bottom-style:none] tw:[border-bottom-color:var(--rule)] tw:[&:last-child]:[border-bottom-color:currentcolor] tw:bg-[color:var(--surface)] tw:text-left",
  schemaRowActive:
    "tw:[outline:2px_solid_var(--selection)] tw:outline-offset-[-2px] tw:bg-[color:var(--rpc-wash)]",
  schemaRowPrimary:
    "tw:[background-image:repeating-linear-gradient(135deg,_var(--accent-stripe)_0,_var(--accent-stripe)_7px,_var(--transparent)_7px,_var(--transparent)_14px)]",
  schemaRowName:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--ink)] tw:font-[family-name:var(--font-mono)] tw:text-[length:12px] tw:text-ellipsis tw:whitespace-nowrap",
  schemaKeyFlag:
    "tw:mr-[6px] tw:bg-[color:var(--diff-modified-bg)] tw:text-[color:var(--diff-modified)]",
  schemaKeyFlagForeign:
    "tw:bg-[color:var(--rpc-wash)] tw:text-[color:var(--rpc)]",
  schemaRowType:
    "tw:min-w-0 tw:overflow-hidden tw:text-[color:var(--ink-muted)] tw:font-[family-name:var(--font-mono)] tw:text-[length:11px] tw:text-right tw:text-ellipsis tw:whitespace-nowrap",
};

// A change's border replaces the card's hairline.
const nodeStatusStyles = {
  added: "tw:border-[color:var(--change-added)]",
  removed:
    "tw:border-dashed tw:border-[color:var(--change-removed)] tw:opacity-[0.75]",
  modified: "tw:border-[color:var(--change-modified)]",
};

// A selected store's shape takes the change color, or the selection's.
const storeSelectedStyles = {
  unchanged: "tw:[--software-map-storage-border:var(--selection)]",
  added: "tw:[--software-map-storage-border:var(--change-added)]",
  removed: "tw:[--software-map-storage-border:var(--change-removed)]",
  modified: "tw:[--software-map-storage-border:var(--change-modified)]",
};

const codeRingStyles = {
  selected: "tw:[&::before]:[box-shadow:inset_0_0_0_1.5px_var(--selection)]",
  added: "tw:[&::before]:[box-shadow:inset_0_0_0_1.5px_var(--change-added)]",
  removed:
    "tw:[&::before]:[box-shadow:inset_0_0_0_1.5px_var(--change-removed)]",
  modified:
    "tw:[&::before]:[box-shadow:inset_0_0_0_1.5px_var(--change-modified)]",
};

// React Flow takes node and edge classes as strings.
const FLOW_NODE_CLASS_NAME = styles.flowNode;

const FLOW_EDGE_CLASS_NAME = styles.flowEdge;
