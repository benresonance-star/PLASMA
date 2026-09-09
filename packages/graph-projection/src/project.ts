import {
  presentationRelationLabel,
  toPresentationRelationType,
  toStorageRelationType,
} from '@spds/semantic-core';
import {
  walkNeighbourhood,
  type DependencyEdge,
  type IndexedSemanticGraph,
  type QueryableObject,
} from '@spds/semantic-query';
import { buildPatternCard, detailLevelForDepth } from './pattern-card.js';
import { buildPatternInspector } from './pattern-types.js';
import type {
  GraphProjection,
  GraphViewEdge,
  GraphViewNode,
  ProjectionRole,
  SemanticDepth,
} from './types.js';

export interface ProjectCausalNeighbourhoodInput {
  readonly graph: IndexedSemanticGraph;
  readonly dependencyEdges: readonly DependencyEdge[];
  /** Seeds the neighbourhood walk / pattern expansion (stable lens anchor). */
  readonly focusObjectIds: readonly string[];
  /**
   * Nodes that receive projectionRole `focus` (selection highlight).
   * Defaults to focusObjectIds. Keep separate so clicking parameters does not
   * re-anchor / reshuffle the whole pattern system layout.
   */
  readonly highlightObjectIds?: readonly string[];
  readonly radius?: number;
  readonly depth?: SemanticDepth;
  readonly relationshipTypes?: readonly string[];
  readonly projectionId?: string;
  /**
   * When true (default), expand around producing patterns so selection shows
   * Parameter → Pattern → sibling Entities (not a star into the focus alone).
   */
  readonly expandPatternContext?: boolean;
}

/** Relations that define the primary causal spine for layout. */
const PATTERN_DRIVE_RELATIONS = new Set([
  'pattern.drives',
  'drives',
  'DRIVES',
  'INPUT_TO',
  'input-to',
]);

const PATTERN_PRODUCE_RELATIONS = new Set([
  'produces',
  'generates',
  'GENERATES',
  'OUTPUT_OF',
  'output-of',
  'generated-from',
]);

/** Shortcut edges that clutter the lens when a pattern path already exists. */
const REDUNDANT_SHORTCUT_RELATIONS = new Set([
  'depends-on',
  'DEPENDS_ON',
  'part-of',
  'CONTAINS',
  'contains',
]);

/** Containment — include in walks and you pull the whole model node into the lens. */
const CONTAINMENT_RELATIONS = new Set([
  'part-of',
  'CONTAINS',
  'contains',
  'COMPOSES',
  'composes',
  'pattern.composes',
]);

const COL_X = 280;
const ROW_Y = 96;

function familyFor(obj: QueryableObject): GraphViewNode['family'] {
  const t = obj.semanticType;
  if (t.startsWith('pattern.')) return 'Pattern';
  if (t.startsWith('parameter.')) return 'Parameter';
  if (t.startsWith('field.')) return 'Field';
  if (t.startsWith('constraint.') || t.includes('constraint')) return 'Constraint';
  if (t.startsWith('execution.') || t.startsWith('operator.')) return 'Operator';
  return 'Entity';
}

function roleFor(
  id: string,
  focus: ReadonlySet<string>,
  upstreamIds: ReadonlySet<string>,
  downstreamIds: ReadonlySet<string>,
): ProjectionRole {
  if (focus.has(id)) return 'focus';
  if (upstreamIds.has(id)) return 'upstream';
  if (downstreamIds.has(id)) return 'downstream';
  return 'context';
}

function columnForFamily(family: GraphViewNode['family']): number {
  switch (family) {
    case 'Parameter':
    case 'Field':
    case 'SketchIntent':
      return 0;
    case 'Pattern':
    case 'Rule':
    case 'Constraint':
    case 'Affector':
    case 'Operator':
      return 1;
    case 'Entity':
    case 'Output':
    case 'Assembly':
    case 'Connection':
    case 'Material':
    case 'Measurement':
    case 'Representation':
    case 'AIChange':
      return 2;
    default: {
      const _exhaustive: never = family;
      return _exhaustive;
    }
  }
}

function edgeKey(e: DependencyEdge): string {
  return `${e.from}|${e.to}|${e.relationType ?? ''}`;
}

function relationMatches(relationType: string | undefined, set: ReadonlySet<string>): boolean {
  if (!relationType) return false;
  if (set.has(relationType)) return true;
  const storage = toStorageRelationType(relationType);
  if (set.has(storage)) return true;
  return set.has(String(toPresentationRelationType(storage)));
}

function isPatternDrive(relationType: string | undefined): boolean {
  return relationMatches(relationType, PATTERN_DRIVE_RELATIONS);
}

function isPatternProduce(relationType: string | undefined): boolean {
  return relationMatches(relationType, PATTERN_PRODUCE_RELATIONS);
}

function isRedundantShortcut(relationType: string | undefined): boolean {
  return relationMatches(relationType, REDUNDANT_SHORTCUT_RELATIONS);
}

/**
 * Grow the neighbourhood to the full relevant pattern system:
 * drivers → pattern → all produced siblings.
 */
function expandAroundPatterns(input: {
  readonly dependencyEdges: readonly DependencyEdge[];
  readonly graph: IndexedSemanticGraph;
  readonly nodeIds: Set<string>;
  readonly edgeBag: Map<string, DependencyEdge>;
  readonly upstreamIds: Set<string>;
  readonly downstreamIds: Set<string>;
  readonly focus: ReadonlySet<string>;
}): void {
  const patterns = new Set<string>();
  for (const id of input.nodeIds) {
    const obj = input.graph.get(id);
    if (obj && familyFor(obj) === 'Pattern') patterns.add(id);
  }
  for (const e of input.dependencyEdges) {
    if (!isPatternProduce(e.relationType)) continue;
    if (input.nodeIds.has(e.to) || input.focus.has(e.to)) {
      patterns.add(e.from);
      input.nodeIds.add(e.from);
      if (!input.focus.has(e.from)) input.upstreamIds.add(e.from);
    }
  }

  for (const patternId of patterns) {
    for (const e of input.dependencyEdges) {
      if (e.to === patternId && isPatternDrive(e.relationType)) {
        input.nodeIds.add(e.from);
        input.edgeBag.set(edgeKey(e), e);
        if (!input.focus.has(e.from)) input.upstreamIds.add(e.from);
      }
      if (e.from === patternId && isPatternProduce(e.relationType)) {
        input.nodeIds.add(e.to);
        input.edgeBag.set(edgeKey(e), e);
        if (!input.focus.has(e.to)) {
          if (input.upstreamIds.has(e.to)) input.upstreamIds.delete(e.to);
          input.downstreamIds.add(e.to);
        }
      }
    }
  }
}

function filterEdgesForClearCausalSpine(input: {
  readonly edges: readonly DependencyEdge[];
  readonly graph: IndexedSemanticGraph;
  readonly nodeIds: ReadonlySet<string>;
}): DependencyEdge[] {
  const hasPattern = [...input.nodeIds].some((id) => {
    const obj = input.graph.get(id);
    return obj ? familyFor(obj) === 'Pattern' : false;
  });
  if (!hasPattern) return [...input.edges];

  return input.edges.filter((e) => {
    if (!input.nodeIds.has(e.from) || !input.nodeIds.has(e.to)) return false;
    // Prefer the Pattern spine; hide Parameter→Entity depends-on and part-of clutter.
    if (isRedundantShortcut(e.relationType)) return false;
    return true;
  });
}

/**
 * Resolve a stable pattern-system anchor for the causal lens.
 * Selecting parameters/entities within the same system keeps the same anchor
 * so layout does not jump under the cursor.
 */
export function resolveCausalAnchorId(
  selectedId: string,
  dependencyEdges: readonly DependencyEdge[],
): string {
  for (const e of dependencyEdges) {
    if (e.to === selectedId && isPatternProduce(e.relationType)) return e.from;
  }
  for (const e of dependencyEdges) {
    if (e.from === selectedId && isPatternDrive(e.relationType)) return e.to;
  }
  return selectedId;
}

/** Deterministic layered layout: Parameter | Pattern | Entity. */
export function layoutCausalColumns(
  nodes: readonly {
    readonly semanticId: string;
    readonly family: GraphViewNode['family'];
    readonly projectionRole: ProjectionRole;
  }[],
): Map<string, { x: number; y: number }> {
  const columns = new Map<number, string[]>();
  // Stable order by id only — never promote selection to the top (that stole clicks).
  const sorted = [...nodes].sort((a, b) => a.semanticId.localeCompare(b.semanticId));

  for (const n of sorted) {
    const col = columnForFamily(n.family);
    const list = columns.get(col) ?? [];
    list.push(n.semanticId);
    columns.set(col, list);
  }

  const maxRows = Math.max(1, ...[...columns.values()].map((ids) => ids.length));
  const positions = new Map<string, { x: number; y: number }>();
  for (const [col, ids] of columns) {
    const offsetY = ((maxRows - ids.length) * ROW_Y) / 2;
    ids.forEach((id, index) => {
      positions.set(id, { x: col * COL_X, y: offsetY + index * ROW_Y });
    });
  }
  return positions;
}

/**
 * Project selected objects + causal neighbourhood into a disposable GraphProjection.
 * React Flow must not be imported here.
 */
export function projectCausalNeighbourhood(
  input: ProjectCausalNeighbourhoodInput,
): GraphProjection {
  const radius = input.radius ?? 1;
  const depth = input.depth ?? 'system';
  const expandPatternContext = input.expandPatternContext !== false;
  const focusObjectIds = [...new Set(input.focusObjectIds.filter(Boolean))];
  const highlightObjectIds = [
    ...new Set((input.highlightObjectIds ?? focusObjectIds).filter(Boolean)),
  ];
  const highlight = new Set(highlightObjectIds);
  const seedFocus = new Set(focusObjectIds);
  const relationFilter = input.relationshipTypes?.map(toStorageRelationType);
  const walkEdges = input.dependencyEdges.filter(
    (e) => !relationMatches(e.relationType, CONTAINMENT_RELATIONS),
  );

  const upstreamIds = new Set<string>();
  const downstreamIds = new Set<string>();
  const edgeBag = new Map<string, DependencyEdge>();

  for (const focusId of focusObjectIds) {
    const up = walkNeighbourhood(walkEdges, focusId, 'upstream', {
      radius,
      ...(relationFilter ? { relationTypes: relationFilter } : {}),
    });
    const down = walkNeighbourhood(walkEdges, focusId, 'downstream', {
      radius,
      ...(relationFilter ? { relationTypes: relationFilter } : {}),
    });
    for (const id of up.ids) upstreamIds.add(id);
    for (const id of down.ids) downstreamIds.add(id);
    for (const e of [...up.edges, ...down.edges]) {
      edgeBag.set(edgeKey(e), e);
    }
  }

  const nodeIds = new Set<string>([...focusObjectIds, ...upstreamIds, ...downstreamIds]);

  if (expandPatternContext) {
    expandAroundPatterns({
      dependencyEdges: walkEdges,
      graph: input.graph,
      nodeIds,
      edgeBag,
      upstreamIds,
      downstreamIds,
      focus: seedFocus,
    });
  }

  const filteredEdges = filterEdgesForClearCausalSpine({
    edges: [...edgeBag.values()],
    graph: input.graph,
    nodeIds,
  });

  const draftNodes = [...nodeIds].sort().map((id) => {
    const obj = input.graph.get(id) ?? {
      id,
      semanticType: 'unknown',
      attributes: {},
    };
    const projectionRole = roleFor(id, highlight, upstreamIds, downstreamIds);
    return {
      semanticId: id,
      semanticType: obj.semanticType,
      projectionRole,
      family: familyFor(obj),
      summary: obj.semanticType,
      label: id,
    };
  });

  const positions = layoutCausalColumns(draftNodes);
  const detailLevel = detailLevelForDepth(depth);

  const nodes: GraphViewNode[] = draftNodes.map((n) => {
    const base: GraphViewNode = {
      viewId: `view:node:${n.semanticId}`,
      semanticId: n.semanticId,
      semanticType: n.semanticType,
      projectionRole: n.projectionRole,
      label: n.label,
      family: n.family,
      detailLevel,
      summary: n.summary,
      positionHint: positions.get(n.semanticId) ?? { x: 0, y: 0 },
    };
    if (n.family !== 'Pattern') return base;
    const leaf = n.semanticId.includes(':')
      ? n.semanticId.slice(n.semanticId.lastIndexOf(':') + 1)
      : n.semanticId;
    const paramEntries = draftNodes
      .filter((d) => d.family === 'Parameter')
      .map((d) => {
        const key = d.semanticId.slice(d.semanticId.lastIndexOf(':') + 1);
        return [key, key] as const;
      });
    const inspector = buildPatternInspector({
      patternId: n.semanticId,
      name: leaf,
      parameters: Object.fromEntries(paramEntries),
      operatorBindings:
        depth === 'execution'
          ? { [`op:${leaf}`]: 'occt.boolean-fuse' }
          : {},
    });
    const card = buildPatternCard({ inspector, depth, detailLevel });
    return {
      ...base,
      card: {
        title: card.title,
        intent: card.intent,
        parameters: card.parameters.map((p) => ({ key: p.key, value: p.value })),
        inputs: [...card.inputs],
        rules: [...card.rules],
        affectors: [...card.affectors],
        operators: [...card.operators],
      },
      summary: card.intent,
    };
  });

  const edges: GraphViewEdge[] = [];
  for (const e of filteredEdges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    const storage = e.relationType ? toStorageRelationType(e.relationType) : 'depends-on';
    const presentation = String(toPresentationRelationType(storage));
    const relationshipId = `rel:${e.from}:${storage}:${e.to}`;
    edges.push({
      viewId: `view:edge:${relationshipId}`,
      relationshipId,
      fromSemanticId: e.from,
      toSemanticId: e.to,
      relationType: storage,
      presentationType: presentation,
      label: presentationRelationLabel(storage),
    });
  }

  return {
    projectionId:
      input.projectionId ??
      `proj:causal:${focusObjectIds.join(',') || 'none'}:r${radius}`,
    focusObjectIds,
    depth,
    relationshipTypes: relationFilter ?? [],
    causalRadius: radius,
    nodes,
    edges,
    layoutHints: {
      mode: 'causal',
      ...(focusObjectIds[0] !== undefined
        ? { anchorSemanticId: focusObjectIds[0] }
        : {}),
    },
  };
}
