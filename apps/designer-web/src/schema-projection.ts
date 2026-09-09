/**
 * Layered Schema catalog projection for SchemaCanvas (plan S06).
 * Columns (causal-aligned L→R): Kinds | Parameters | Patterns | LiveSets | Components.
 */

import {
  CREATE_KINDS_ALLOWLIST,
  GOLDBERG_PATTERN_PUBLISHED_ID,
  PARAM_D01_ARM_WIDTH_ID,
  PARAM_D01_LENGTH_ID,
  PARAM_D01_STRUCTURAL_DEPTH_ID,
} from '@spds/ai-interface';
import type { SchemaViewModel } from './schema-view.js';

export type SchemaProjectionRole =
  | 'kind'
  | 'pattern'
  | 'parameter'
  | 'live'
  | 'capability'
  | 'component';

export type SchemaLensMode = 'mutable' | 'full';

export interface SchemaProjectionNode {
  readonly viewId: string;
  readonly semanticId: string;
  readonly role: SchemaProjectionRole;
  readonly label: string;
  readonly mutable: boolean;
  readonly position: { readonly x: number; readonly y: number };
  readonly summary?: string;
  /** Live type that can expand into component instance nodes. */
  readonly expandable?: boolean;
  readonly expanded?: boolean;
  readonly memberIds?: readonly string[];
  readonly memberCount?: number;
  /** Instance → owning live-type set semantic id. */
  readonly parentSetId?: string;
}

export interface SchemaProjectionEdge {
  readonly viewId: string;
  readonly fromSemanticId: string;
  readonly toSemanticId: string;
  readonly relationType: string;
  readonly label: string;
}

export interface SchemaProjection {
  readonly nodes: readonly SchemaProjectionNode[];
  readonly edges: readonly SchemaProjectionEdge[];
  readonly lens: SchemaLensMode;
}

/** Match causal lens column pitch (`layoutCausalColumns`). */
const COL_X = 280;
const ROW_Y = 96;

const COL_INDEX = {
  kind: 0,
  parameter: 1,
  pattern: 2,
  live: 3,
  component: 4,
} as const;

/** Preferred kind order so binds align with adjacent columns. */
const KIND_ORDER = ['Parameter', 'Pattern', 'Entity', 'Operator', 'Constraint'] as const;

const D01_PARAM_IDS = [
  PARAM_D01_LENGTH_ID,
  PARAM_D01_ARM_WIDTH_ID,
  PARAM_D01_STRUCTURAL_DEPTH_ID,
] as const;

function shortLeaf(id: string): string {
  if (id.startsWith('param:')) {
    const leaf = id.slice(id.lastIndexOf(':') + 1);
    return leaf || id;
  }
  const parts = id.split(':');
  if (parts.length >= 2) return parts.slice(-2).join(':');
  return id;
}

function mutableKindSet(vm: SchemaViewModel): Set<string> {
  const allow = vm.mutate?.kindsAllowlist ?? CREATE_KINDS_ALLOWLIST;
  return new Set([...allow, 'Parameter', 'Pattern', 'parameter.number']);
}

function mutableParamIds(vm: SchemaViewModel): Set<string> {
  const fromMutate = vm.mutate?.parameters.map((p) => p.id) ?? [...D01_PARAM_IDS];
  return new Set(fromMutate);
}

function mutablePatternIds(vm: SchemaViewModel): Set<string> {
  const ids = new Set<string>([GOLDBERG_PATTERN_PUBLISHED_ID, 'geodesic']);
  for (const p of vm.patterns) {
    if (p.includes('goldberg') || p === 'geodesic' || p.startsWith('pattern:')) {
      ids.add(p);
    }
  }
  return ids;
}

function sortKinds(kinds: readonly string[]): string[] {
  const rank = new Map<string, number>(KIND_ORDER.map((k, i) => [k, i]));
  return [...kinds].sort((a, b) => {
    const ra = rank.get(a) ?? 100 + a.localeCompare(b);
    const rb = rank.get(b) ?? 100 + b.localeCompare(a);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

function sortLiveTypes(
  types: readonly SchemaViewModel['liveTypes'][number][],
): SchemaViewModel['liveTypes'][number][] {
  const rank = (t: string): number => {
    if (t.startsWith('parameter.')) return 0;
    if (t.startsWith('structural.')) return 1;
    if (t.startsWith('structure.')) return 2;
    if (t === 'ui.folder') return 3;
    return 4;
  };
  return [...types].sort((a, b) => {
    const d = rank(a.semanticType) - rank(b.semanticType);
    if (d !== 0) return d;
    return a.semanticType.localeCompare(b.semanticType);
  });
}

/** Structural / structure live types can expand into component instance nodes. */
export function isSchemaComponentSetType(semanticType: string): boolean {
  return (
    semanticType.startsWith('structural.') || semanticType.startsWith('structure.')
  );
}

export function toggleExpandedSchemaSet(
  expanded: ReadonlySet<string>,
  setSemanticId: string,
): Set<string> {
  const next = new Set(expanded);
  if (next.has(setSemanticId)) next.delete(setSemanticId);
  else next.add(setSemanticId);
  return next;
}

/**
 * Deterministic layered layout with vertical centering (same contract as
 * `layoutCausalColumns` in graph-projection).
 */
export function layoutSchemaColumns(
  nodes: readonly {
    readonly semanticId: string;
    readonly role: SchemaProjectionRole;
  }[],
): Map<string, { x: number; y: number }> {
  const columns = new Map<number, string[]>();
  for (const n of nodes) {
    const col =
      n.role === 'capability'
        ? COL_INDEX.kind
        : (COL_INDEX[n.role as keyof typeof COL_INDEX] ?? COL_INDEX.kind);
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

type DraftNode = {
  semanticId: string;
  role: SchemaProjectionRole;
  viewId: string;
  label: string;
  mutable: boolean;
  summary?: string;
  expandable?: boolean;
  expanded?: boolean;
  memberIds?: readonly string[];
  memberCount?: number;
  parentSetId?: string;
};

export function projectSchemaCatalog(input: {
  readonly schema: SchemaViewModel;
  readonly lens?: SchemaLensMode;
  /** Live-type semantic ids whose component sets are expanded. */
  readonly expandedSetIds?: ReadonlySet<string>;
}): SchemaProjection {
  const lens: SchemaLensMode = input.lens ?? 'mutable';
  const expandedSetIds = input.expandedSetIds ?? new Set<string>();
  const vm = input.schema;
  const kindAllow = mutableKindSet(vm);
  const paramAllow = mutableParamIds(vm);
  const patternAllow = mutablePatternIds(vm);

  const kinds = sortKinds(
    lens === 'full'
      ? [...vm.kinds]
      : vm.kinds.filter((k) => kindAllow.has(k) || k === 'Entity' || k === 'Operator'),
  );
  const patterns =
    lens === 'full' ? [...vm.patterns] : vm.patterns.filter((p) => patternAllow.has(p));
  const parameters =
    lens === 'full'
      ? [...(vm.mutate?.parameters.map((p) => p.id) ?? D01_PARAM_IDS)]
      : [...paramAllow];
  const liveTypes = sortLiveTypes(
    lens === 'full'
      ? [...vm.liveTypes]
      : vm.liveTypes.filter(
          (t) =>
            t.semanticType.startsWith('structural.') ||
            t.semanticType.startsWith('structure.') ||
            t.semanticType === 'ui.folder' ||
            t.semanticType.startsWith('parameter.'),
        ),
  );

  const draft: DraftNode[] = [];

  for (const k of kinds) {
    draft.push({
      viewId: `schema:kind:${k}`,
      semanticId: k,
      role: 'kind',
      label: k,
      mutable: kindAllow.has(k),
    });
  }

  for (const id of parameters) {
    const meta = vm.mutate?.parameters.find((p) => p.id === id);
    const summary = meta
      ? `${meta.domain.min}–${meta.domain.max} ${meta.quantity?.unit ?? 'mm'}`
      : undefined;
    draft.push({
      viewId: `schema:param:${id}`,
      semanticId: id,
      role: 'parameter',
      label: meta?.path ?? shortLeaf(id),
      mutable: paramAllow.has(id),
      ...(summary !== undefined ? { summary } : {}),
    });
  }

  for (const p of patterns) {
    draft.push({
      viewId: `schema:pattern:${p}`,
      semanticId: p,
      role: 'pattern',
      label: shortLeaf(p),
      mutable: patternAllow.has(p),
      summary: 'pattern',
    });
  }

  const componentSets: {
    readonly semanticType: string;
    readonly memberIds: readonly string[];
    readonly count: number;
    readonly expanded: boolean;
  }[] = [];

  for (const t of liveTypes) {
    const expandable =
      isSchemaComponentSetType(t.semanticType) && t.sampleIds.length > 0;
    const expanded = expandable && expandedSetIds.has(t.semanticType);
    const memberIds = expandable ? t.sampleIds : undefined;
    let summary: string | undefined = t.sampleIds[0];
    if (expandable) {
      summary = expanded
        ? memberIds && t.count > memberIds.length
          ? `expanded · ${memberIds.length}/${t.count} · dbl-click to hide`
          : 'expanded · dbl-click to hide'
        : 'set · dbl-click to show components';
      componentSets.push({
        semanticType: t.semanticType,
        memberIds: t.sampleIds,
        count: t.count,
        expanded,
      });
    }
    draft.push({
      viewId: `schema:live:${t.semanticType}`,
      semanticId: t.semanticType,
      role: 'live',
      label: `${t.semanticType} ×${t.count}`,
      mutable: false,
      ...(summary !== undefined ? { summary } : {}),
      ...(expandable
        ? {
            expandable: true,
            expanded,
            memberIds: t.sampleIds,
            memberCount: t.count,
          }
        : {}),
    });

    if (expanded && memberIds) {
      for (const memberId of memberIds) {
        draft.push({
          viewId: `schema:component:${memberId}`,
          semanticId: memberId,
          role: 'component',
          label: shortLeaf(memberId),
          mutable: false,
          summary: t.semanticType,
          parentSetId: t.semanticType,
        });
      }
    }
  }

  const positions = layoutSchemaColumns(draft);
  const nodes: SchemaProjectionNode[] = draft.map((n) => ({
    viewId: n.viewId,
    semanticId: n.semanticId,
    role: n.role,
    label: n.label,
    mutable: n.mutable,
    position: positions.get(n.semanticId) ?? { x: 0, y: 0 },
    ...(n.summary !== undefined ? { summary: n.summary } : {}),
    ...(n.expandable ? { expandable: true } : {}),
    ...(n.expanded !== undefined ? { expanded: n.expanded } : {}),
    ...(n.memberIds !== undefined ? { memberIds: n.memberIds } : {}),
    ...(n.memberCount !== undefined ? { memberCount: n.memberCount } : {}),
    ...(n.parentSetId !== undefined ? { parentSetId: n.parentSetId } : {}),
  }));

  const edges: SchemaProjectionEdge[] = [];
  const nodeIds = new Set(nodes.map((n) => n.semanticId));

  // Adjacent spine: Parameter kind → params → patterns → live (L→R, like causal).
  if (nodeIds.has('Parameter')) {
    for (const paramId of parameters) {
      if (!nodeIds.has(paramId)) continue;
      edges.push({
        viewId: `schema:edge:binds:Parameter:${paramId}`,
        fromSemanticId: 'Parameter',
        toSemanticId: paramId,
        relationType: 'binds',
        label: 'binds',
      });
    }
  }

  for (const paramId of parameters) {
    if (!nodeIds.has(paramId)) continue;
    for (const patternId of patterns) {
      if (!patternAllow.has(patternId) && lens === 'mutable') continue;
      if (!nodeIds.has(patternId)) continue;
      if (paramId === PARAM_D01_LENGTH_ID || paramId.includes('length')) {
        edges.push({
          viewId: `schema:edge:drives:${paramId}:${patternId}`,
          fromSemanticId: paramId,
          toSemanticId: patternId,
          relationType: 'drives',
          label: 'drives',
        });
      }
    }
  }

  if (nodeIds.has('Pattern')) {
    for (const patternId of patterns) {
      if (!nodeIds.has(patternId)) continue;
      edges.push({
        viewId: `schema:edge:binds:Pattern:${patternId}`,
        fromSemanticId: 'Pattern',
        toSemanticId: patternId,
        relationType: 'binds',
        label: 'binds',
      });
    }
  }

  for (const patternId of patterns) {
    if (!nodeIds.has(patternId)) continue;
    for (const t of liveTypes) {
      if (!nodeIds.has(t.semanticType)) continue;
      if (
        t.semanticType.startsWith('structural.') ||
        t.semanticType.startsWith('structure.')
      ) {
        edges.push({
          viewId: `schema:edge:produces:${patternId}:${t.semanticType}`,
          fromSemanticId: patternId,
          toSemanticId: t.semanticType,
          relationType: 'binds',
          label: 'produces',
        });
      }
    }
  }

  // Entity kind → component sets (catalog link so Entity is not orphaned).
  if (nodeIds.has('Entity')) {
    for (const set of componentSets) {
      if (!nodeIds.has(set.semanticType)) continue;
      edges.push({
        viewId: `schema:edge:binds:Entity:${set.semanticType}`,
        fromSemanticId: 'Entity',
        toSemanticId: set.semanticType,
        relationType: 'binds',
        label: 'binds',
      });
    }
  }

  // Expanded set → member component instances.
  for (const set of componentSets) {
    if (!set.expanded) continue;
    for (const memberId of set.memberIds) {
      if (!nodeIds.has(memberId)) continue;
      edges.push({
        viewId: `schema:edge:members:${set.semanticType}:${memberId}`,
        fromSemanticId: set.semanticType,
        toSemanticId: memberId,
        relationType: 'binds',
        label: 'member',
      });
    }
  }

  // Alias sample: SDI CONTAINS → storage part-of when both present.
  for (const pair of vm.sdiToStorage) {
    if (pair.sdi && pair.storage && (pair.sdi === 'CONTAINS' || pair.storage === 'part-of')) {
      if (nodeIds.has('Entity') && nodeIds.has('ui.folder')) {
        edges.push({
          viewId: `schema:edge:alias:${pair.sdi}:${pair.storage}`,
          fromSemanticId: 'Entity',
          toSemanticId: 'ui.folder',
          relationType: 'alias',
          label: `${pair.sdi}→${pair.storage}`,
        });
        break;
      }
    }
  }

  nodes.sort((a, b) => {
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return a.position.y - b.position.y;
  });

  return { nodes, edges, lens };
}
