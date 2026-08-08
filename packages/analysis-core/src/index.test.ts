import { describe, expect, it } from 'vitest';
import {
  attachGroupsToAnalysis,
  buildD01AnalysisFixture,
  deriveBeamsFromYNetwork,
  exportAnalysisFixture,
  importResultsMock,
} from './index.js';

describe('G15 analysis-core', () => {
  it('provides solver-neutral schema and beam abstraction from Y network', () => {
    const derived = deriveBeamsFromYNetwork(
      [{ id: 'Y:1', a: [0, 0, 0], b: [10, 0, 0] }],
      'sec:1',
      'mat:1',
    );
    expect(derived.beams[0]?.semanticSourceId).toBe('Y:1');
    expect(derived.nodes).toHaveLength(2);

    const groups = attachGroupsToAnalysis({
      materialGroupSemanticIds: ['Y:1'],
      supportGroupSemanticIds: ['support:1'],
      loadGroupSemanticIds: ['load:1'],
    });
    expect(groups.mappedSemanticIds).toContain('Y:1');

    const model = buildD01AnalysisFixture();
    const exported = exportAnalysisFixture(model);
    expect(exported.format).toBe('spds-analysis-json');
    expect(exported.labelPolicy).toBe('computational-indicative');

    const results = importResultsMock([
      {
        loadCaseId: 'lc:1',
        quantity: 'displacement',
        valuesByEntityId: { [model.nodes[0]!.id]: 0.01 },
        labelPolicy: 'computational-indicative',
      },
    ]);
    expect(results.viewportLabels[0]?.indicative).toBe(true);
  });
});
