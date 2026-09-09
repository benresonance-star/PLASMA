import { describe, expect, it } from 'vitest';
import { buildPatternCard } from '@spds/graph-projection';
import type { PatternInspectorView } from '@spds/graph-projection';

const inspector: PatternInspectorView = {
  patternId: 'pattern:goldberg-cellular-topology@1.0.0',
  name: 'Goldberg',
  draftOnly: false,
  parameters: { lengthMm: 2300, armWidthMm: 80 },
  nodes: [{ id: 'n1', kind: 'subpattern', label: 'cell' }],
  operatorBindings: { gen: 'y-network.v1' },
};

describe('PatternCardView / buildPatternCard share', () => {
  it('omits operators at intent; includes at execution', () => {
    const t0 = performance.now();
    const intent = buildPatternCard({ inspector, depth: 'intent' });
    const exec = buildPatternCard({ inspector, depth: 'execution' });
    expect(performance.now() - t0).toBeLessThan(1);
    expect(intent.operators).toEqual([]);
    expect(intent.intent).toMatch(/Intent/);
    expect(exec.operators.length).toBeGreaterThan(0);
    expect(exec.parameters.some((p) => p.key === 'lengthMm')).toBe(true);
  });
});
