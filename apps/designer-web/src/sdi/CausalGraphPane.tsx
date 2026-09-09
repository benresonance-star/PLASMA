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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphProjection, LensId, SemanticDepth } from '@spds/graph-projection';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover.js';
import { Switch } from '../components/ui/switch.js';
import { HelpTooltip, HelpTooltipScope } from '../ui/HelpTooltip.js';
import { PatternCardView } from '../ui/PatternCardView.js';
import { useHtmlDarkClass } from '../ui/use-html-dark-class.js';
import {
  projectionToReactFlow,
  semanticIdsFromRfSelection,
  type SdiRfEdgeData,
  type SdiRfNodeData,
} from './reactflow-adapter.js';

const CAUSAL_TITLE_TOOLTIP =
  'Causal lens shows how the selected object relates to parameters, patterns, constraints, and downstream effects. Selection stays synced with the viewport and inspector.';

const PATTERN_SPACE_TOOLTIP =
  'Pattern space focuses the graph on the entered pattern’s internal structure — inputs, parameters, rules, and affectors — without leaving the causal lens.';

const DEPTH_TOOLTIP =
  'Semantic depth controls how deep the explanation goes: Form (what you see), Intent (why), System (patterns and relationships), Logic (how patterns work), Execution (operators and generation).';

const DEPTH_OPTION_TOOLTIPS: Record<SemanticDepth, string> = {
  form: 'Form — what you are looking at: geometry-facing entities and outputs around the selection.',
  intent: 'Intent — why it is shaped this way: goals, parameters, and design rationale linked to the selection.',
  system:
    'System — which patterns, constraints, and relationships affect the selection across the model.',
  logic: 'Logic — how those patterns operate: rules, dependencies, and causal structure in more detail.',
  execution:
    'Execution — how the design is calculated and generated, including operators and kernel-facing steps.',
};

const LENS_TOOLTIP =
  'Lenses filter which families appear in the graph. Toggle Patterns, Parameters, Entities, Dependencies, Constraints, Fields, and Fabrication to focus the causal neighbourhood.';

const LENS_OPTION_TOOLTIPS: Record<LensId, string> = {
  patterns: 'Patterns — show pattern nodes that define reusable structure and intent around the selection.',
  parameters: 'Parameters — show editable inputs that drive the selection and its dependents.',
  entities: 'Entities — show concrete design objects and assemblies in the causal neighbourhood.',
  dependencies: 'Dependencies — emphasize relationship edges and the objects they connect.',
  constraints: 'Constraints — show rules and constraint nodes that limit or validate the design.',
  fields: 'Fields — show field/influence nodes linked to the selection.',
  fabrication: 'Fabrication — show material, measurement, and output nodes used for make/publish.',
};

const AGGREGATE_TOOLTIP =
  'Collapse dense entity families into summary nodes when a family has more than 8 instances (for example many Y components). Edges rewire to the aggregate and duplicates merge, which keeps large graphs readable. Turn off to show every instance as its own node.';

const RESET_LAYOUT_TOOLTIP =
  'Reset node positions to the default causal layout. Your current selection and filters are kept.';

const READ_ONLY_TOOLTIP =
  'This view explains the live model graph. It does not edit geometry directly — use the inspector parameters or What-if for changes.';

const SKETCH_TOOLTIP =
  'Begin a sketch intent draft in the graph. Sketch captures spatial intent as a first-class draft before committing geometry changes.';

const CANCEL_SKETCH_TOOLTIP = 'Discard the in-progress sketch intent draft and return to the live graph view.';

const ENTER_PATTERN_TOOLTIP =
  'Enter pattern space for the selected pattern to inspect its internal inputs, parameters, and rules.';

const EXIT_PATTERN_TOOLTIP = 'Leave pattern space and return to the surrounding causal neighbourhood.';

const DEPTHS: readonly SemanticDepth[] = [
  'form',
  'intent',
  'system',
  'logic',
  'execution',
];

const LENS_OPTIONS: readonly { readonly id: LensId; readonly label: string }[] = [
  { id: 'patterns', label: 'Patterns' },
  { id: 'parameters', label: 'Parameters' },
  { id: 'entities', label: 'Entities' },
  { id: 'dependencies', label: 'Dependencies' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'fields', label: 'Fields' },
  { id: 'fabrication', label: 'Fabrication' },
];

function depthLabel(depth: SemanticDepth): string {
  switch (depth) {
    case 'form':
      return 'Form';
    case 'intent':
      return 'Intent';
    case 'system':
      return 'System';
    case 'logic':
      return 'Logic';
    case 'execution':
      return 'Execution';
    default: {
      const _exhaustive: never = depth;
      return _exhaustive;
    }
  }
}

function lensLabel(id: LensId): string {
  switch (id) {
    case 'patterns':
      return 'Patterns';
    case 'parameters':
      return 'Parameters';
    case 'entities':
      return 'Entities';
    case 'dependencies':
      return 'Dependencies';
    case 'constraints':
      return 'Constraints';
    case 'fields':
      return 'Fields';
    case 'fabrication':
      return 'Fabrication';
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function formatLensSummary(active: readonly LensId[]): string {
  if (active.length === 0) return 'No lenses';
  const names = active.map(lensLabel);
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

function SdiEntityNode(props: NodeProps<Node<SdiRfNodeData>>) {
  const role = props.data.projectionRole;
  const family = props.data.family;
  const selected = props.selected === true;
  return (
    <div
      className={[
        'sdi-rf-node',
        `sdi-rf-node--${role}`,
        `sdi-rf-node--family-${family}`,
        selected ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-semantic-id={props.data.semanticId}
      data-family={family}
      data-selected={selected ? 'true' : 'false'}
    >
      <Handle type="target" position={Position.Left} className="sdi-rf-handle" />
      <strong>{props.data.label}</strong>
      <span>{family}</span>
      <Handle type="source" position={Position.Right} className="sdi-rf-handle" />
    </div>
  );
}

/** SD3.1 intent-first pattern summary card (Level A/B+). */
function SdiPatternNode(props: NodeProps<Node<SdiRfNodeData>>) {
  const selected = props.selected === true;
  const card = props.data.card;
  return (
    <div
      className={[
        'sdi-rf-node',
        'sdi-rf-node--family-Pattern',
        'sdi-rf-pattern-card',
        `sdi-rf-node--${props.data.projectionRole}`,
        selected ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-semantic-id={props.data.semanticId}
      data-family="Pattern"
      data-selected={selected ? 'true' : 'false'}
    >
      <Handle type="target" position={Position.Left} className="sdi-rf-handle" />
      <strong>{card?.title ?? props.data.label}</strong>
      <span>Pattern · {props.data.detailLevel ?? 'A'}</span>
      {card ? (
        <div className="sdi-rf-pattern-card-body">
          <PatternCardView card={card} compact />
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} className="sdi-rf-handle" />
    </div>
  );
}

function SdiRelationEdge(props: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  });
  const data = props.data as SdiRfEdgeData | undefined;
  const hoverLabel = data?.hoverLabel ?? String(props.label ?? 'relates');
  const intoGeometry = data?.intoGeometry === true;
  const stroke = hovered
    ? intoGeometry
      ? '#27ae60'
      : 'var(--foreground)'
    : intoGeometry
      ? '#2ecc71'
      : 'var(--muted-foreground)';

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        className={intoGeometry ? 'sdi-rf-edge-path sdi-rf-edge-path--flow' : 'sdi-rf-edge-path'}
        {...(props.markerEnd !== undefined ? { markerEnd: props.markerEnd } : {})}
        style={{
          stroke,
          strokeWidth: hovered ? 2.4 : intoGeometry ? 2 : 1.5,
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
        <title>{hoverLabel}</title>
      </path>
      {hovered ? (
        <EdgeLabelRenderer>
          <div
            className="sdi-rf-edge-tooltip"
            style={{
              transform: `translate(${labelX}px, ${labelY}px) translate(-50%, -50%)`,
            }}
          >
            {hoverLabel}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { sdiEntity: SdiEntityNode, sdiPattern: SdiPatternNode };
const edgeTypes = { sdiRelation: SdiRelationEdge };

function FitViewOnLayout(props: {
  readonly layoutEpoch: number;
  readonly nodeKey: string;
}) {
  const { fitView } = useReactFlow();
  const booted = useRef(false);
  useEffect(() => {
    // Fit on first mount, when the node set changes, or when user requests layout reset.
    if (!booted.current) {
      booted.current = true;
    }
    const t = window.setTimeout(() => {
      void fitView({ padding: 0.22, duration: props.layoutEpoch > 0 ? 180 : 0 });
    }, 0);
    return () => window.clearTimeout(t);
  }, [props.layoutEpoch, props.nodeKey, fitView]);
  return null;
}

function CausalGraphInner(props: {
  readonly projection: GraphProjection | null;
  readonly selectedSemanticId: string | null;
  readonly onSelectSemantic: (semanticId: string | null) => void;
  readonly emptyMessage: string;
  readonly onRetrySeed?: (() => void) | undefined;
  readonly dark: boolean;
  readonly layoutEpoch: number;
}) {
  const mapped = useMemo(
    () =>
      props.projection
        ? projectionToReactFlow(props.projection)
        : { nodes: [], edges: [] },
    [props.projection],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(mapped.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(mapped.edges);
  const syncingFromPropsRef = useRef(false);
  const onSelectSemanticRef = useRef(props.onSelectSemantic);
  onSelectSemanticRef.current = props.onSelectSemantic;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  /** User-dragged positions keyed by semantic id — survive selection / projection refresh. */
  const userPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastLayoutEpochRef = useRef(props.layoutEpoch);

  const nodeKey = useMemo(
    () =>
      mapped.nodes
        .map((n) => n.data.semanticId)
        .sort()
        .join('|'),
    [mapped.nodes],
  );

  useEffect(() => {
    if (props.layoutEpoch !== lastLayoutEpochRef.current) {
      lastLayoutEpochRef.current = props.layoutEpoch;
      userPositionsRef.current.clear();
    }
  }, [props.layoutEpoch]);

  useEffect(() => {
    syncingFromPropsRef.current = true;
    setNodes(
      mapped.nodes.map((n) => {
        const preserved = userPositionsRef.current.get(n.data.semanticId);
        return {
          ...n,
          position: preserved ?? n.position,
          selected: n.data.semanticId === props.selectedSemanticId,
        };
      }),
    );
    setEdges(mapped.edges);
    const t = window.setTimeout(() => {
      syncingFromPropsRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [mapped, props.selectedSemanticId, props.layoutEpoch, setNodes, setEdges]);

  const selectedRef = useRef(props.selectedSemanticId);
  selectedRef.current = props.selectedSemanticId;

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes as NodeChange<Node<SdiRfNodeData>>[]);
      for (const change of changes) {
        if (change.type !== 'position' || !('position' in change) || !change.position) continue;
        const node = nodesRef.current.find((n) => n.id === change.id) as
          | Node<SdiRfNodeData>
          | undefined;
        if (!node) continue;
        // Persist while dragging and on drop so selection sync cannot wipe placement.
        userPositionsRef.current.set(node.data.semanticId, {
          x: change.position.x,
          y: change.position.y,
        });
      }
    },
    [onNodesChange],
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    if (syncingFromPropsRef.current) return;
    const ids = semanticIdsFromRfSelection(
      nodesRef.current as Node<SdiRfNodeData>[],
      selectedNodes.map((n) => n.id),
    );
    const next = ids[0];
    if (!next || next === selectedRef.current) return;
    onSelectSemanticRef.current(next);
  }, []);

  if (!props.projection) {
    return (
      <div className="sdi-graph-empty">
        <p>{props.emptyMessage}</p>
        {props.onRetrySeed ? (
          <button type="button" className="sdi-graph-empty-action" onClick={props.onRetrySeed}>
            Seed live D01 substrate
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <ReactFlow
      className={props.dark ? 'sdi-rf-dark' : 'sdi-rf-light'}
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      onSelectionChange={onSelectionChange}
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
      defaultEdgeOptions={{
        type: 'sdiRelation',
      }}
    >
      <FitViewOnLayout layoutEpoch={props.layoutEpoch} nodeKey={nodeKey} />
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
          const family = (n.data as SdiRfNodeData | undefined)?.family;
          if (family === 'Parameter') return '#2ecc71';
          if (family === 'Pattern') return '#5dade2';
          if (n.selected) return '#c8782a';
          return props.dark ? '#5a6270' : '#9aa3ad';
        }}
      />
    </ReactFlow>
  );
}

export function CausalGraphPane(props: {
  readonly open: boolean;
  readonly projection: GraphProjection | null;
  readonly selectedSemanticId: string | null;
  readonly onSelectSemantic: (semanticId: string | null) => void;
  readonly emptyMessage: string;
  readonly onRetrySeed?: (() => void) | undefined;
  readonly depth: SemanticDepth;
  readonly onDepthChange: (depth: SemanticDepth) => void;
  readonly lenses?: readonly LensId[];
  readonly onToggleLens?: (lens: LensId) => void;
  readonly aggregateEnabled?: boolean;
  readonly onAggregateChange?: (enabled: boolean) => void;
  readonly enteredPatternId?: string | null;
  readonly onEnterPattern?: (() => void) | undefined;
  readonly onExitPattern?: (() => void) | undefined;
  readonly sketchDraftActive?: boolean;
  readonly onBeginSketch?: (() => void) | undefined;
  readonly onCancelSketch?: (() => void) | undefined;
}) {
  const dark = useHtmlDarkClass();
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [depthMenuOpen, setDepthMenuOpen] = useState(false);
  const [lensMenuOpen, setLensMenuOpen] = useState(false);
  if (!props.open) return null;
  const title = props.enteredPatternId ? 'Pattern space' : 'Causal lens';
  const activeLensIds = props.lenses ?? [];
  const activeLenses = new Set(activeLensIds);
  const lensSummary = formatLensSummary(activeLensIds);
  return (
    <aside
      className={`sdi-graph-pane${dark ? ' sdi-graph-pane--dark' : ' sdi-graph-pane--light'}`}
      aria-label={title}
      data-theme={dark ? 'dark' : 'light'}
    >
      <HelpTooltipScope>
        <div className="sdi-graph-pane-head">
          <div className="sdi-graph-pane-head-top">
            <HelpTooltip
              content={props.enteredPatternId ? PATTERN_SPACE_TOOLTIP : CAUSAL_TITLE_TOOLTIP}
            >
              <h2>{title}</h2>
            </HelpTooltip>
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

          <div className="sdi-graph-pane-head-menus">
            <div className="sdi-toolbar-field">
              <HelpTooltip content={DEPTH_TOOLTIP} asChild={false}>
                <span className="sdi-toolbar-field-label">Depth</span>
              </HelpTooltip>
              <Popover open={depthMenuOpen} onOpenChange={setDepthMenuOpen}>
                <HelpTooltip
                  content={DEPTH_OPTION_TOOLTIPS[props.depth]}
                  disabled={depthMenuOpen}
                >
                  <span className="sdi-toolbar-select-wrap">
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="sdi-toolbar-select"
                        aria-label={`Semantic depth: ${depthLabel(props.depth)}`}
                      >
                        <span className="sdi-toolbar-select-label">{depthLabel(props.depth)}</span>
                        <ChevronDown className="size-3.5 opacity-70" />
                      </Button>
                    </PopoverTrigger>
                  </span>
                </HelpTooltip>
                <PopoverContent align="start" className="w-56 p-1.5">
                  <HelpTooltipScope>
                    <div className="flex flex-col gap-0.5" role="listbox" aria-label="Semantic depth">
                      {DEPTHS.map((d) => {
                        const selected = props.depth === d;
                        return (
                          <HelpTooltip key={d} content={DEPTH_OPTION_TOOLTIPS[d]} side="right">
                            <Button
                              type="button"
                              size="sm"
                              variant={selected ? 'default' : 'ghost'}
                              className="justify-between"
                              role="option"
                              aria-selected={selected}
                              onClick={() => {
                                props.onDepthChange(d);
                                setDepthMenuOpen(false);
                              }}
                            >
                              <span>{depthLabel(d)}</span>
                              {selected ? <Check className="size-3.5" aria-hidden /> : null}
                            </Button>
                          </HelpTooltip>
                        );
                      })}
                    </div>
                  </HelpTooltipScope>
                </PopoverContent>
              </Popover>
            </div>

            {props.onToggleLens ? (
              <div className="sdi-toolbar-field">
                <HelpTooltip content={LENS_TOOLTIP} asChild={false}>
                  <span className="sdi-toolbar-field-label">Lens</span>
                </HelpTooltip>
                <Popover open={lensMenuOpen} onOpenChange={setLensMenuOpen}>
                  <HelpTooltip content={LENS_TOOLTIP} disabled={lensMenuOpen}>
                    <span className="sdi-toolbar-select-wrap">
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant={activeLensIds.length > 0 ? 'default' : 'outline'}
                          className="sdi-toolbar-select"
                          aria-label={`Lens: ${lensSummary}`}
                        >
                          <span className="sdi-toolbar-select-label">{lensSummary}</span>
                          <ChevronDown className="size-3.5 opacity-70" />
                        </Button>
                      </PopoverTrigger>
                    </span>
                  </HelpTooltip>
                  <PopoverContent align="start" className="w-56 p-1.5">
                    <HelpTooltipScope>
                      <div className="flex flex-col gap-0.5" role="listbox" aria-label="Lens">
                        {LENS_OPTIONS.map((lens) => {
                          const selected = activeLenses.has(lens.id);
                          return (
                            <HelpTooltip
                              key={lens.id}
                              content={LENS_OPTION_TOOLTIPS[lens.id]}
                              side="right"
                            >
                              <Button
                                type="button"
                                size="sm"
                                variant={selected ? 'default' : 'ghost'}
                                className="justify-between"
                                role="option"
                                aria-selected={selected}
                                onClick={() => props.onToggleLens?.(lens.id)}
                              >
                                <span>{lens.label}</span>
                                {selected ? <Check className="size-3.5" aria-hidden /> : null}
                              </Button>
                            </HelpTooltip>
                          );
                        })}
                      </div>
                    </HelpTooltipScope>
                  </PopoverContent>
                </Popover>
              </div>
            ) : null}

            {props.onAggregateChange ? (
              <div className="sdi-toolbar-field sdi-toolbar-field--toggle">
                <HelpTooltip content={AGGREGATE_TOOLTIP} asChild={false}>
                  <span className="sdi-toolbar-field-label">Aggregate</span>
                </HelpTooltip>
                <HelpTooltip content={AGGREGATE_TOOLTIP}>
                  <div className="sdi-aggregate-toggle">
                    <Switch
                      id="sdi-aggregate-switch"
                      size="sm"
                      checked={props.aggregateEnabled === true}
                      onCheckedChange={props.onAggregateChange}
                      aria-label="Aggregate dense entity families"
                    />
                  </div>
                </HelpTooltip>
              </div>
            ) : null}
          </div>

          <div className="sdi-graph-pane-head-meta">
            <span className="sdi-graph-pane-status">
              {props.enteredPatternId ? (
                <HelpTooltip content={EXIT_PATTERN_TOOLTIP}>
                  <button type="button" className="sdi-graph-link" onClick={props.onExitPattern}>
                    Back
                  </button>
                </HelpTooltip>
              ) : props.selectedSemanticId?.startsWith('pattern:') && props.onEnterPattern ? (
                <HelpTooltip content={ENTER_PATTERN_TOOLTIP}>
                  <button type="button" className="sdi-graph-link" onClick={props.onEnterPattern}>
                    Enter
                  </button>
                </HelpTooltip>
              ) : (
                <HelpTooltip content={READ_ONLY_TOOLTIP} asChild={false}>
                  Read-only
                </HelpTooltip>
              )}
            </span>
            {props.onBeginSketch && !props.sketchDraftActive ? (
              <HelpTooltip content={SKETCH_TOOLTIP}>
                <button
                  type="button"
                  className="sdi-graph-link"
                  onClick={props.onBeginSketch}
                >
                  Sketch
                </button>
              </HelpTooltip>
            ) : null}
            {props.sketchDraftActive && props.onCancelSketch ? (
              <HelpTooltip content={CANCEL_SKETCH_TOOLTIP}>
                <button
                  type="button"
                  className="sdi-graph-link"
                  onClick={props.onCancelSketch}
                >
                  Cancel sketch
                </button>
              </HelpTooltip>
            ) : null}
          </div>
        </div>
      </HelpTooltipScope>
      <div className="sdi-graph-pane-body">
        <ReactFlowProvider>
          <CausalGraphInner
            projection={props.projection}
            selectedSemanticId={props.selectedSemanticId}
            onSelectSemantic={props.onSelectSemantic}
            emptyMessage={props.emptyMessage}
            onRetrySeed={props.onRetrySeed}
            dark={dark}
            layoutEpoch={layoutEpoch}
          />
        </ReactFlowProvider>
      </div>
    </aside>
  );
}
