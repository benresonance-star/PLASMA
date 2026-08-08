import { describe, expect, it } from 'vitest';
import { ProvenanceStore } from './provenance.js';
import { parseSemanticPath, resolvePersistentPath, surviveRegeneration } from './paths.js';

describe('G3B.2–3 provenance and persistent refs', () => {
  it('stores and queries provenance by semantic anchor', () => {
    const store = new ProvenanceStore();
    store.write({
      id: 'prov:1',
      semanticAnchor: 'component:y:0042',
      relation: 'generated-from',
      pirOperationId: 'pir:topology.goldberg',
      kernelResultId: 'kernel:op:1',
      subElementIds: ['face:ref:0042-a'],
      causes: ['param:frequency'],
    });
    expect(store.bySemanticAnchor('component:y:0042')[0]?.pirOperationId).toBe(
      'pir:topology.goldberg',
    );
  });

  it('parses semantic paths and resolves sub-elements', () => {
    const parsed = parseSemanticPath('component:y:0042/arm:A/start');
    expect(parsed.owner).toBe('component:y:0042');
    expect(parsed.segments).toEqual(['arm:A', 'start']);

    const resolved = resolvePersistentPath('component:y:0042/arm:A/start', [
      {
        id: 'component:y:0042',
        semanticType: 'structural.y-component',
        subElements: { 'arm:A/start': 'vertex:ref:start' },
      },
    ]);
    expect(resolved.status).toBe('resolved');
  });

  it('survives approved remap and fails unresolved when identity lost', () => {
    const before = [
      {
        id: 'component:y:0042',
        semanticType: 'structural.y-component',
        subElements: { 'arm:A/mounting-face': 'face:old' },
      },
    ];
    const after = [
      {
        id: 'component:y:0042',
        semanticType: 'structural.y-component',
        subElements: { 'arm:A/mounting-face': 'face:new' },
      },
    ];
    const ok = surviveRegeneration({
      path: 'component:y:0042/arm:A/mounting-face',
      before,
      after,
      remap: { 'face:old': 'face:new' },
    });
    expect(ok.status).toBe('resolved');
    if (ok.status === 'resolved') expect(ok.targetId).toBe('face:new');

    const lost = surviveRegeneration({
      path: 'component:y:0042/arm:A/mounting-face',
      before,
      after: [
        {
          id: 'component:y:0042',
          semanticType: 'structural.y-component',
          subElements: {},
        },
      ],
    });
    expect(lost.status).toBe('unresolved');
  });
});
