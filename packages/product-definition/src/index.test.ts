import { describe, expect, it } from 'vitest';
import {
  AP242_CAPABILITY_MATRIX,
  attachPmi,
  buildAp242ExportReport,
  buildProductTopology,
  deserializePmi,
  queryMappingsForDesign,
  serializePmi,
  solidsForDesignMember,
} from './index.js';

describe('G10A product-definition', () => {
  it('maps design members to zero-or-more solids', () => {
    const topo = buildProductTopology({
      root: { id: 'prod:asm', kind: 'assembly', name: 'A01', children: ['prod:p1'] },
      nodes: [{ id: 'prod:p1', kind: 'part', name: 'plate', children: [] }],
      mappings: [
        {
          designSemanticId: 'design:plate',
          productNodeId: 'prod:p1',
          solidIds: ['solid:a', 'solid:b'],
          provenance: { snapshotId: 'snap:1', generatedBy: 'product-definition' },
        },
      ],
    });
    expect(solidsForDesignMember(topo, 'design:plate')).toEqual(['solid:a', 'solid:b']);
    expect(queryMappingsForDesign(topo, 'design:plate')).toHaveLength(1);
  });

  it('attaches PMI to selectors and survives without UI', () => {
    let store = { objects: [] };
    store = attachPmi(
      store,
      {
        id: 'pmi:1',
        kind: 'Datum',
        selector: 'sel:face/A',
        payload: { label: 'A' },
      },
      { selectorAmbiguous: false, selectorResolved: true },
    );
    expect(() =>
      attachPmi(
        store,
        { id: 'pmi:2', kind: 'Tolerance', selector: 'sel:x', payload: {} },
        { selectorAmbiguous: true, selectorResolved: true },
      ),
    ).toThrow(/SELECTOR_AMBIGUOUS/);
    const round = deserializePmi(serializePmi(store));
    expect(round.objects).toHaveLength(1);
  });

  it('reports AP242 PMI limitations without data loss', () => {
    expect(AP242_CAPABILITY_MATRIX.some((c) => !c.supported)).toBe(true);
    const report = buildAp242ExportReport(['Datum', 'Tolerance']);
    expect(report.unsupportedRetainedInDb.length).toBeGreaterThan(0);
    expect(report.limitationSummary).toMatch(/partial/);
  });
});
