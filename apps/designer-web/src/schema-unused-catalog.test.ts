import { describe, expect, it } from 'vitest';
import {
  GOLDBERG_PATTERN_PUBLISHED_ID,
  PARAM_D01_LENGTH_ID,
} from '@spds/ai-interface';
import {
  countUnusedCatalogItems,
  filterUnusedCatalogGroups,
  listUnusedSchemaCatalog,
  usedSchemaCanvasIds,
} from './schema-unused-catalog.js';
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
    kinds: ['Parameter', 'Pattern', 'Entity', 'Constraint', 'Affector', 'Operator'],
    relationships: {
      core: ['part-of', 'depends-on'],
      sdi: ['CONTAINS', 'DRIVES'],
      sdiToStorage: [{ sdi: 'CONTAINS', storage: 'part-of' }],
    },
    liveTypes: [
      {
        semanticType: 'structural.y-component',
        count: 3,
        sampleIds: ['component:y:0000'],
      },
      {
        semanticType: 'analysis.mesh',
        count: 1,
        sampleIds: ['mesh:1'],
      },
    ],
    organisation: { folderCount: 0, folderIds: [] },
    patterns: [GOLDBERG_PATTERN_PUBLISHED_ID],
    operators: ['y-network.v1', 'unused.operator'],
  });
  expect(base).not.toBeNull();
  return attachSchemaMutateSlice(base!, defaultSchemaMutateSlice({ lengthMm: 2300 }));
}

describe('schema-unused-catalog', () => {
  it('lists catalog entries not on the mutable canvas, grouped by kind', () => {
    const schema = d01Schema();
    const used = usedSchemaCanvasIds(schema);
    expect(used.has(PARAM_D01_LENGTH_ID)).toBe(true);
    expect(used.has('structural.y-component')).toBe(true);

    const groups = listUnusedSchemaCatalog(schema);
    expect(countUnusedCatalogItems(groups)).toBeGreaterThan(0);
    expect(groups.some((g) => g.kind === 'Kinds')).toBe(true);

    const kindIds = new Set(
      groups.flatMap((g) => g.items.map((i) => i.id)),
    );
    expect(kindIds.has('Constraint') || kindIds.has('Affector')).toBe(true);
    expect(kindIds.has(PARAM_D01_LENGTH_ID)).toBe(false);
    expect(kindIds.has('structural.y-component')).toBe(false);
    expect(kindIds.has('analysis.mesh')).toBe(true);
    expect(kindIds.has('unused.operator')).toBe(true);
    expect(kindIds.has('depends-on') || kindIds.has('DRIVES')).toBe(true);
  });

  it('filters unused groups by search query', () => {
    const schema = d01Schema();
    const groups = listUnusedSchemaCatalog(schema);
    const filtered = filterUnusedCatalogGroups(groups, 'affect');
    expect(filtered.every((g) => g.items.length > 0)).toBe(true);
    expect(
      filtered.some((g) => g.items.some((i) => i.id.toLowerCase().includes('affect'))),
    ).toBe(true);
  });
});
