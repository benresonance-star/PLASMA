/**
 * Schema ontology React Flow canvas (plan S08) — RF chrome parity with Causal lens.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnNodeDrag,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RefreshCw } from 'lucide-react';
import {
  loadSchemaModelLayoutPrefs,
  persistSchemaModelLayoutPrefs,
  positionsMapFromPrefs,
  positionsRecordFromMap,
} from '../schema-layout-prefs.js';
import {
  SCHEMA_PARAM_GROUP_VIEW_ID,
  applyParameterContainer,
  collectAbsolutePositions,
  dissolveParameterContainer,
  refitParameterContainer,
  type SchemaCanvasNode,
} from '../schema-param-container.js';
import {
  projectSchemaCatalog,
  toggleExpandedSchemaSet,
} from '../schema-projection.js';
import {
  nextSchemaSemanticFromRfSelection,
  schemaProjectionToReactFlow,
  type SchemaRfEdgeData,
  type SchemaRfNodeData,
} from '../schema-reactflow-adapter.js';
import type { SchemaViewModel } from '../schema-view.js';
import { Input } from '../components/ui/input.js';
import { Switch } from '../components/ui/switch.js';
import { HelpTooltip, HelpTooltipScope } from './HelpTooltip.js';
import { useHtmlDarkClass } from './use-html-dark-class.js';

const RESET_LAYOUT_TOOLTIP =
  'Reset node positions to the default schema layout. Your current selection and filters are kept.';

const PARAM_CONTAINER_TOOLTIP =
  'Group parameter nodes in a container. Drag the frame to move them together; drag a parameter freely and the frame refits.';

const LAYOUT_PERSIST_DEBOUNCE_MS = 200;

function schemaModelKey(schema: SchemaViewModel): string {
  return schema.modelId.trim() || 'catalog';
}

function SchemaParamGroupNode(props: NodeProps) {
  const data = props.data as SchemaRfNodeData;
  const selected = props.selected === true;
  return (
    <HelpTooltip
      content={
        <div className="schema-rf-hover-copy">
          <strong>{data.hoverTitle}</strong>
          <p>{data.hoverPurpose}</p>
          <p className="schema-rf-hover-copy-muted">How to use: {data.hoverHowToUse}</p>
        </div>
      }
      side="top"
      align="center"
    >
      <div
        className={['schema-rf-param-group', selected ? 'is-selected' : ''].filter(Boolean).join(' ')}
        data-semantic-id={data.semanticId}
        data-role="param-group"
        data-selected={selected ? 'true' : 'false'}
      >
        <span className="schema-rf-param-group-label">{data.label}</span>
      </div>
    </HelpTooltip>
  );
}

function SchemaNode(props: NodeProps) {
  const data = props.data as SchemaRfNodeData;
  const selected = props.selected === true;
  const tooltip = (
    <div className="schema-rf-hover-copy">
      <strong>{data.hoverTitle}</strong>
      <p>{data.hoverPurpose}</p>
      <p className="schema-rf-hover-copy-muted">How to use: {data.hoverHowToUse}</p>
    </div>
  );
  return (
    <HelpTooltip content={tooltip} side="top" align="center">
      <div
        className={[
          'schema-rf-node-chrome',
          `schema-rf-node--${data.role}`,
          data.mutable ? 'is-mutable' : '',
          data.provisional ? 'is-provisional' : '',
          data.expandable ? 'is-set' : '',
          data.expanded ? 'is-expanded' : '',
          selected ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-semantic-id={data.semanticId}
        data-role={data.role}
        data-mutable={data.mutable ? 'true' : 'false'}
        data-expandable={data.expandable ? 'true' : 'false'}
        data-expanded={data.expanded ? 'true' : 'false'}
        data-selected={selected ? 'true' : 'false'}
      >
        <Handle type="target" position={Position.Left} className="sdi-rf-handle" />
        <strong>{data.label}</strong>
        <span>
          {data.role === 'component'
            ? 'component'
            : data.expandable
              ? data.expanded
                ? 'set · expanded'
                : 'set'
              : data.role}
          {data.mutable ? ' · mutable' : ''}
        </span>
        {data.summary ? <span className="schema-rf-node-summary">{data.summary}</span> : null}
        <Handle type="source" position={Position.Right} className="sdi-rf-handle" />
      </div>
    </HelpTooltip>
  );
}

function SchemaRelationEdge(props: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  });
  const data = props.data as SchemaRfEdgeData | undefined;
  const hoverLabel = data?.hoverLabel ?? String(props.label ?? 'relates');
  const hoverDetail = data?.hoverDetail;
  const drivesGeometry = data?.drivesGeometry === true;
  const alias = data?.relationType === 'alias';
  const stroke = hovered
    ? drivesGeometry
      ? '#27ae60'
      : 'var(--foreground)'
    : drivesGeometry
      ? '#2ecc71'
      : 'var(--muted-foreground)';
  const pathClass = [
    'sdi-rf-edge-path',
    drivesGeometry ? 'sdi-rf-edge-path--flow' : '',
    alias ? 'schema-rf-edge-path--alias' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const nativeTitle = hoverDetail ? `${hoverLabel}\n${hoverDetail}` : hoverLabel;

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        className={pathClass}
        {...(props.markerEnd !== undefined ? { markerEnd: props.markerEnd } : {})}
        style={{
          stroke,
          strokeWidth: hovered ? 2.4 : drivesGeometry ? 2 : 1.5,
        }}
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        className="sdi-rf-edge-hit"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <title>{nativeTitle}</title>
      </path>
      {hovered ? (
        <EdgeLabelRenderer>
          <div
            className="sdi-rf-edge-tooltip sdi-rf-edge-tooltip--detail"
            style={{
              transform: `translate(${labelX}px, ${labelY}px) translate(-50%, -50%)`,
            }}
          >
            <strong>{hoverLabel}</strong>
            {hoverDetail ? <span>{hoverDetail}</span> : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = {
  schemaNode: SchemaNode,
  schemaParamGroup: SchemaParamGroupNode,
};
const edgeTypes = { schemaRelation: SchemaRelationEdge };

function FitViewOnLayout(props: {
  readonly layoutEpoch: number;
  readonly nodeKey: string;
}) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: props.layoutEpoch > 0 ? 180 : 0 });
    }, 0);
    return () => window.clearTimeout(t);
  }, [props.layoutEpoch, props.nodeKey, fitView]);
  return null;
}

function SchemaCanvasInner(props: {
  readonly schema: SchemaViewModel;
  readonly selectedSemanticId: string | null;
  readonly provisionalSemanticIds: ReadonlySet<string>;
  readonly onSelectSchemaNode: (semanticId: string | null) => void;
  readonly dark: boolean;
}) {
  const modelKey = schemaModelKey(props.schema);
  const initialPrefs = useMemo(() => loadSchemaModelLayoutPrefs(modelKey), [modelKey]);
  /** Canvas always shows the mutable/active graph; unused catalog lives in the Schema rail. */
  const [filter, setFilter] = useState('');
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [expandedSetIds, setExpandedSetIds] = useState<ReadonlySet<string>>(
    () => new Set(initialPrefs.expandedSetIds),
  );
  const [parameterContainer, setParameterContainer] = useState(
    () => initialPrefs.parameterContainer !== false,
  );
  const syncingFromPropsRef = useRef(false);
  const onSelectRef = useRef(props.onSelectSchemaNode);
  onSelectRef.current = props.onSelectSchemaNode;
  const selectedRef = useRef(props.selectedSemanticId);
  selectedRef.current = props.selectedSemanticId;
  /** User-dragged positions keyed by semantic id — survive selection / projection refresh. */
  const userPositionsRef = useRef<Map<string, { x: number; y: number }>>(
    positionsMapFromPrefs(initialPrefs),
  );
  const lastLayoutEpochRef = useRef(layoutEpoch);
  const lastModelKeyRef = useRef(modelKey);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedRef = useRef(expandedSetIds);
  expandedRef.current = expandedSetIds;
  const parameterContainerRef = useRef(parameterContainer);
  parameterContainerRef.current = parameterContainer;

  const flushLayoutPrefs = useCallback(() => {
    persistSchemaModelLayoutPrefs(modelKey, {
      positions: positionsRecordFromMap(userPositionsRef.current),
      expandedSetIds: [...expandedRef.current],
      lens: 'mutable',
      parameterContainer: parameterContainerRef.current,
    });
  }, [modelKey]);

  const scheduleLayoutPersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      flushLayoutPrefs();
    }, LAYOUT_PERSIST_DEBOUNCE_MS);
  }, [flushLayoutPrefs]);

  // Reload layout when the active model changes.
  useEffect(() => {
    if (lastModelKeyRef.current === modelKey) return;
    lastModelKeyRef.current = modelKey;
    const prefs = loadSchemaModelLayoutPrefs(modelKey);
    userPositionsRef.current = positionsMapFromPrefs(prefs);
    setExpandedSetIds(new Set(prefs.expandedSetIds));
    setParameterContainer(prefs.parameterContainer !== false);
    setLayoutEpoch(0);
    lastLayoutEpochRef.current = 0;
  }, [modelKey]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      flushLayoutPrefs();
    };
  }, [flushLayoutPrefs]);

  useEffect(() => {
    scheduleLayoutPersist();
  }, [expandedSetIds, parameterContainer, scheduleLayoutPersist]);

  const projection = useMemo(
    () =>
      projectSchemaCatalog({
        schema: props.schema,
        lens: 'mutable',
        expandedSetIds,
      }),
    [props.schema, expandedSetIds],
  );

  const filteredProjection = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return projection;
    const matched = new Set(
      projection.nodes
        .filter(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            n.semanticId.toLowerCase().includes(q) ||
            n.role.toLowerCase().includes(q),
        )
        .map((n) => n.semanticId),
    );
    // Keep component set ↔ member pairs together when either side matches.
    for (const n of projection.nodes) {
      if (n.parentSetId && matched.has(n.semanticId)) matched.add(n.parentSetId);
      if (n.expandable && matched.has(n.semanticId)) {
        for (const id of n.memberIds ?? []) matched.add(id);
      }
    }
    const nodes = projection.nodes.filter((n) => matched.has(n.semanticId));
    const edges = projection.edges.filter(
      (e) => matched.has(e.fromSemanticId) && matched.has(e.toSemanticId),
    );
    return { ...projection, nodes, edges };
  }, [projection, filter]);

  const adapted = useMemo(
    () =>
      schemaProjectionToReactFlow(filteredProjection, {
        provisionalSemanticIds: props.provisionalSemanticIds,
        selectedSemanticId: props.selectedSemanticId,
      }),
    [filteredProjection, props.provisionalSemanticIds, props.selectedSemanticId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(adapted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(adapted.edges);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const nodeKey = useMemo(
    () =>
      adapted.nodes
        .map((n) => n.data.semanticId)
        .sort()
        .join('|'),
    [adapted.nodes],
  );

  useEffect(() => {
    if (layoutEpoch !== lastLayoutEpochRef.current) {
      lastLayoutEpochRef.current = layoutEpoch;
      userPositionsRef.current.clear();
      scheduleLayoutPersist();
    }
  }, [layoutEpoch, scheduleLayoutPersist]);

  useEffect(() => {
    syncingFromPropsRef.current = true;
    const positioned = adapted.nodes.map((n) => {
      const preserved = userPositionsRef.current.get(n.data.semanticId);
      return {
        ...n,
        position: preserved ?? n.position,
        selected: n.data.semanticId === props.selectedSemanticId,
      };
    }) as SchemaCanvasNode[];
    const next = parameterContainer
      ? applyParameterContainer(positioned)
      : dissolveParameterContainer(positioned);
    setNodes(next);
    setEdges(adapted.edges);
    const t = window.setTimeout(() => {
      syncingFromPropsRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [
    adapted,
    props.selectedSemanticId,
    layoutEpoch,
    parameterContainer,
    setNodes,
    setEdges,
  ]);

  const persistAbsoluteFromGraph = useCallback(
    (graph: readonly SchemaCanvasNode[]) => {
      const abs = collectAbsolutePositions(graph);
      for (const [id, pos] of abs) {
        userPositionsRef.current.set(id, pos);
      }
      scheduleLayoutPersist();
    },
    [scheduleLayoutPersist],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes as NodeChange<Node<SchemaRfNodeData>>[]);
    },
    [onNodesChange],
  );

  const onNodeDragStop = useCallback<OnNodeDrag>(
    (_event, node) => {
      setNodes((current) => {
        const graph = current as SchemaCanvasNode[];
        const touchesContainer =
          parameterContainerRef.current &&
          (node.id === SCHEMA_PARAM_GROUP_VIEW_ID ||
            node.parentId === SCHEMA_PARAM_GROUP_VIEW_ID);
        const next = touchesContainer ? refitParameterContainer(graph) : graph;
        persistAbsoluteFromGraph(next);
        return next;
      });
    },
    [persistAbsoluteFromGraph, setNodes],
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodes }: OnSelectionChangeParams) => {
    const next = nextSchemaSemanticFromRfSelection(
      nodesRef.current as Node<SchemaRfNodeData>[],
      selectedNodes.map((n) => n.id),
      syncingFromPropsRef.current,
    );
    if (!next || next === selectedRef.current) return;
    onSelectRef.current(next);
  }, []);

  const onNodeDoubleClick = useCallback((_event: unknown, node: Node) => {
    const data = node.data as SchemaRfNodeData;
    if (!data.expandable) return;
    setExpandedSetIds((prev) => toggleExpandedSchemaSet(prev, data.semanticId));
  }, []);

  return (
    <div
      className={`schema-canvas ${props.dark ? 'schema-canvas--dark' : 'schema-canvas--light'}`}
      data-theme={props.dark ? 'dark' : 'light'}
      data-testid="schema-canvas"
    >
      <HelpTooltipScope>
      <div className="schema-canvas-toolbar" role="toolbar" aria-label="Schema canvas">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter kinds, patterns, params…"
          aria-label="Filter schema nodes"
          className="schema-canvas-filter"
        />
        <HelpTooltip content={PARAM_CONTAINER_TOOLTIP}>
          <label className="schema-canvas-lens">
            <Switch
              checked={parameterContainer}
              onCheckedChange={setParameterContainer}
              aria-label="Parameter container"
            />
            <span>Param container</span>
          </label>
        </HelpTooltip>
        <span className="schema-canvas-lens" aria-live="polite">
          {filteredProjection.nodes.length} nodes
        </span>
        <HelpTooltip content={RESET_LAYOUT_TOOLTIP}>
          <button
            type="button"
            className="sdi-graph-refresh"
            aria-label="Reset graph layout"
            onClick={() => setLayoutEpoch((n) => n + 1)}
          >
            <RefreshCw className="size-3.5" aria-hidden />
          </button>
        </HelpTooltip>
      </div>
      {props.schema.contextMissing ? (
        <p className="schema-canvas-banner" role="status">
          Context missing — showing static catalog. Seed live substrate for model types.
        </p>
      ) : null}
      <div className="schema-canvas-flow">
        <ReactFlow
          className={props.dark ? 'sdi-rf-dark' : 'sdi-rf-light'}
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onSelectionChange={onSelectionChange}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          edgesFocusable
          panOnDrag
          selectionOnDrag={false}
          defaultEdgeOptions={{ type: 'schemaRelation' }}
        >
          <Background
            gap={18}
            color={props.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)'}
            bgColor="transparent"
          />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            maskColor={props.dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.12)'}
            nodeColor={(n) => {
              const role = (n.data as SchemaRfNodeData | undefined)?.role;
              if (role === 'parameter') return '#2ecc71';
              if (role === 'pattern') return '#5dade2';
              if (role === 'component') return '#c8782a';
              if (role === 'live') return '#a78bfa';
              if (n.selected) return '#c8782a';
              return props.dark ? '#5a6270' : '#9aa3ad';
            }}
          />
          <FitViewOnLayout layoutEpoch={layoutEpoch} nodeKey={nodeKey} />
        </ReactFlow>
      </div>
      </HelpTooltipScope>
    </div>
  );
}

export function SchemaCanvas(props: {
  readonly schema: SchemaViewModel | null;
  readonly selectedSemanticId: string | null;
  readonly provisionalSemanticIds?: ReadonlySet<string>;
  readonly onSelectSchemaNode: (semanticId: string | null) => void;
  readonly emptyMessage?: string;
}) {
  const dark = useHtmlDarkClass();
  if (!props.schema) {
    return (
      <div
        className={`schema-canvas schema-canvas--empty ${dark ? 'schema-canvas--dark' : 'schema-canvas--light'}`}
        data-theme={dark ? 'dark' : 'light'}
        data-testid="schema-canvas-empty"
      >
        <p>{props.emptyMessage ?? 'Schema not loaded — seed substrate, then open Schema.'}</p>
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <SchemaCanvasInner
        schema={props.schema}
        selectedSemanticId={props.selectedSemanticId}
        provisionalSemanticIds={props.provisionalSemanticIds ?? new Set()}
        onSelectSchemaNode={props.onSelectSchemaNode}
        dark={dark}
      />
    </ReactFlowProvider>
  );
}
