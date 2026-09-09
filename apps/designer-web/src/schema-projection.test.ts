import { describe, expect, it } from 'vitest';
import {
  GOLDBERG_PATTERN_PUBLISHED_ID,
  PARAM_D01_LENGTH_ID,
} from '@spds/ai-interface';
import {
  layoutSchemaColumns,
  projectSchemaCatalog,
  toggleExpandedSchemaSet,
} from './schema-projection.js';
import {
  attachSchemaMutateSlice,
  defaultSchemaMutateSlice,
  parseSchemaViewPayload,
} from './schema-view.js';

function d01Schema() {
  const base = parseSchemaViewPayload({
    modelId: 'model:d01',
    live: true,
    contextMissing: false,
    kinds: ['Parameter', 'Pattern', 'Entity', 'ui.folder', 'Operator', 'Constraint'],
    relationships: {
      core: ['part-of'],
      sdi: ['CONTAINS'],
      sdiToStorage: [{ sdi: 'CONTAINS', storage: 'part-of' }],
    },
    liveTypes: [
      {
        semanticType: 'parameter.number',
        count: 3,
        sampleIds: ['param:d01:lengthMm'],
      },
      {
        semanticType: 'structural.y-component',
        count: 3,
        sampleIds: ['component:y:0000'],
      },
      {
        semanticType: 'structure.geodesic-dome',
        count: 1,
        sampleIds: ['structure:dome:01'],
      },
    ],
    organisation: { folderCount: 0, folderIds: [] },
    patterns: [GOLDBERG_PATTERN_PUBLISHED_ID],
  });
  expect(base).not.toBeNull();
  return attachSchemaMutateSlice(base!, defaultSchemaMutateSlice({ lengthMm: 2300 }));
}

describe('projectSchemaCatalog', () => {
  it('projects D01 fixture with mutable ⊂ full and length→pattern edge', () => {
    const schema = d01Schema();
    const t0 = performance.now();
    const mutable = projectSchemaCatalog({ schema, lens: 'mutable' });
    const full = projectSchemaCatalog({ schema, lens: 'full' });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(mutable.nodes.length).toBeGreaterThan(0);
    expect(mutable.nodes.length).toBeLessThanOrEqual(full.nodes.length);
    expect(mutable.nodes.every((n, i, arr) => i === 0 || arr[i - 1]!.position.x <= n.position.x)).toBe(
      true,
    );
    const drives = mutable.edges.find(
      (e) =>
        e.relationType === 'drives' &&
        e.fromSemanticId === PARAM_D01_LENGTH_ID &&
        e.toSemanticId === GOLDBERG_PATTERN_PUBLISHED_ID,
    );
    expect(drives).toBeTruthy();
  });

  it('lays out Kind | Parameter | Pattern | Live left-to-right with centered columns', () => {
    const schema = d01Schema();
    const mutable = projectSchemaCatalog({ schema, lens: 'mutable' });
    const byRole = (role: string) => mutable.nodes.filter((n) => n.role === role);
    const kindX = byRole('kind')[0]!.position.x;
    const paramX = byRole('parameter')[0]!.position.x;
    const patternX = byRole('pattern')[0]!.position.x;
    const liveX = byRole('live')[0]!.position.x;
    expect(kindX).toBeLessThan(paramX);
    expect(paramX).toBeLessThan(patternX);
    expect(patternX).toBeLessThan(liveX);

    const produces = mutable.edges.filter((e) => e.label === 'produces');
    expect(produces.length).toBeGreaterThan(0);
    expect(
      produces.every(
        (e) =>
          byRole('pattern').some((n) => n.semanticId === e.fromSemanticId) &&
          byRole('live').some((n) => n.semanticId === e.toSemanticId),
      ),
    ).toBe(true);
  });

  it('layoutSchemaColumns vertically centers shorter columns', () => {
    const positions = layoutSchemaColumns([
      { semanticId: 'Parameter', role: 'kind' },
      { semanticId: 'Pattern', role: 'kind' },
      { semanticId: 'Entity', role: 'kind' },
      { semanticId: 'param:a', role: 'parameter' },
      { semanticId: 'pattern:p', role: 'pattern' },
    ]);
    // 3 kinds → maxRows 3; single pattern centered at row 1 → y = 96
    expect(positions.get('pattern:p')).toEqual({ x: 560, y: 96 });
    expect(positions.get('param:a')).toEqual({ x: 280, y: 96 });
    expect(positions.get('Parameter')).toEqual({ x: 0, y: 0 });
  });

  it('expands component set members on double-click state and collapses again', () => {
    const schema = d01Schema();
    const collapsed = projectSchemaCatalog({ schema, lens: 'mutable' });
    const setNode = collapsed.nodes.find((n) => n.semanticId === 'structural.y-component');
    expect(setNode?.expandable).toBe(true);
    expect(setNode?.expanded).toBe(false);
    expect(collapsed.nodes.some((n) => n.role === 'component')).toBe(false);

    const expandedIds = toggleExpandedSchemaSet(new Set(), 'structural.y-component');
    const expanded = projectSchemaCatalog({
      schema,
      lens: 'mutable',
      expandedSetIds: expandedIds,
    });
    const members = expanded.nodes.filter((n) => n.role === 'component');
    expect(members.length).toBeGreaterThan(0);
    expect(members.every((n) => n.parentSetId === 'structural.y-component')).toBe(true);
    expect(
      expanded.edges.some(
        (e) =>
          e.label === 'member' &&
          e.fromSemanticId === 'structural.y-component' &&
          members.some((m) => m.semanticId === e.toSemanticId),
      ),
    ).toBe(true);

    const collapsedAgain = projectSchemaCatalog({
      schema,
      lens: 'mutable',
      expandedSetIds: toggleExpandedSchemaSet(expandedIds, 'structural.y-component'),
    });
    expect(collapsedAgain.nodes.some((n) => n.role === 'component')).toBe(false);
  });
});
