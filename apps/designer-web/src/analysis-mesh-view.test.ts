import { describe, expect, it } from 'vitest';
import { analysisLabelIsIndicative, buildAnalysisMeshView } from './analysis-mesh-view.js';

describe('E8 Analysis Mesh View', () => {
  it('shows groups and forces indicative labelling', () => {
    const view = buildAnalysisMeshView({
      meshArtifactHash: 'mesh:abc',
      elementCount: 120,
      groupMapping: {
        steel: ['Y:1', 'Y:2'],
        fixed: ['support:1'],
      },
      groupRoles: { steel: 'material', fixed: 'support' },
      labels: [{ entityId: 'beam:Y:1', text: 'utilization=0.3 (indicative)', indicative: true }],
    });
    expect(view.groups).toHaveLength(2);
    expect(view.groups.find((g) => g.name === 'fixed')?.role).toBe('support');
    expect(analysisLabelIsIndicative(view)).toBe(true);
    expect(view.chromeNote).toMatch(/indicative/i);
  });
});
