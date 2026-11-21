import { describe, expect, it } from 'vitest';
import { createSemanticGraph } from '@spds/semantic-core';
import { composeFirstFusion } from './fusion.js';

const at = '2026-11-21T00:00:00.000Z';
function build() {
  return {
    schemaVersion: 2, app: 'Assembly', savedAt: at, revision: 3,
    authoritativeGraph: {
      schemaVersion: 'plasma-build-fixture/0.6.0',
      entities: [
        { id: 'entity:build:building', kind: 'Model', semanticType: 'architecture.building',
          name: 'Building', createdAt: at, updatedAt: at, schemaVersion: '1.0.0' },
        { id: 'entity:build:window', kind: 'Entity', semanticType: 'architecture.hosted-opening',
          name: 'Window', createdAt: at, updatedAt: at, schemaVersion: '1.0.0',
          metadata: { hostId: 'entity:build:building' } },
      ],
      parameters: [
        { id: 'parameter:build:windowwidth', kind: 'Parameter',
          semanticType: 'architecture.window-width', name: 'Width',
          createdAt: at, updatedAt: at, schemaVersion: '1.0.0',
          quantity: { value: 1440, unit: 'mm' }, role: 'design-variable',
          affects: ['entity:build:window'], editableBy: ['user', 'agent'] },
      ],
      relationships: [
        { id: 'relationship:build:window', kind: 'Relationship', semanticType: 'architecture.hosted-by',
          name: 'Host', relationType: 'architecture.hosted-by',
          from: 'entity:build:window', to: 'entity:build:building',
          createdAt: at, updatedAt: at, schemaVersion: '1.0.0' },
      ],
    },
  };
}
function loft() {
  return {
    schemaVersion: 2, units: 'mm', id: 'HotelWindow',
    parts: [{ id: 'FrameA', material: 'Aluminium', parameters: { W: 1440, H: 2100 },
      features: [{ id: 'outline', type: 'sketch' }, { id: 'solid', type: 'extrude' }] }],
    rootAssembly: 'WindowAssembly',
    assemblies: [{ id: 'WindowAssembly', instances: [
      { id: 'W04', partId: 'FrameA', placement: { translation: [1000, 0, 2800] } },
    ] }],
  };
}
const binding = { buildEntityId: 'entity:build:window',
  loftAssemblyId: 'WindowAssembly', loftInstanceId: 'W04' };

describe('FUSION-01 Build + Loft + Plasma semantic authority', () => {
  it('reconciles typed Build objects and Loft occurrences without claiming compilation', () => {
    const result = composeFirstFusion({ buildProject: build(), loftProject: loft(), bindings: [binding] });
    expect(result.status).toBe('preview-only');
    expect(result.publicationReady).toBe(false);
    expect(result.geometryStatus).toBe('source-reference-not-compiled');
    expect(result.parameters[0]?.quantity).toEqual({ value: 1440, unit: 'mm' });
    expect(result.bindings).toHaveLength(1);
    expect(result.relationships.some((r) => r.relationType === 'represented-by' && r.from === binding.buildEntityId)).toBe(true);
    expect(result.objects.some((o) => o.semanticType === 'geometry.loft.part' && o.metadata?.['featureCount'] === 2)).toBe(true);
    createSemanticGraph([...result.objects, ...result.parameters], result.relationships);
  });
  it('retains semantic identity when a Loft geometric parameter changes', () => {
    const a = composeFirstFusion({ buildProject: build(), loftProject: loft(), bindings: [binding] });
    const revised = loft();
    revised.parts[0]!.parameters.W = 1800;
    const b = composeFirstFusion({ buildProject: build(), loftProject: revised, bindings: [binding] });
    expect(a.bindings).toEqual(b.bindings);
    expect(a.sources[1]?.sourceHash).not.toBe(b.sources[1]?.sourceHash);
    expect(a.objects.map((o) => o.id)).toEqual(b.objects.map((o) => o.id));
  });
  it('keeps source systems separate until an explicit binding exists', () => {
    const result = composeFirstFusion({ buildProject: build(), loftProject: loft() });
    expect(result.bindings).toHaveLength(0);
    expect(result.relationships.some((r) => r.relationType === 'represented-by')).toBe(false);
  });
  it('rejects orphan Build parameters and malformed source relationships', () => {
    const broken = build();
    broken.authoritativeGraph.parameters[0]!.affects = ['entity:missing'];
    expect(() => composeFirstFusion({ buildProject: broken, loftProject: loft() }))
      .toThrow(/orphan parameter/);
    const brokenRel = build();
    brokenRel.authoritativeGraph.relationships[0]!.to = 'entity:missing';
    expect(() => composeFirstFusion({ buildProject: brokenRel, loftProject: loft() }))
      .toThrow(/missing endpoint/);
  });
  it('fails closed for unknown occurrences, duplicate bindings, and untyped units', () => {
    expect(() => composeFirstFusion({ buildProject: build(), loftProject: loft(),
      bindings: [{ ...binding, loftInstanceId: 'missing' }] })).toThrow(/unknown Loft occurrence/);
    expect(() => composeFirstFusion({ buildProject: build(), loftProject: loft(),
      bindings: [binding, binding] })).toThrow(/ambiguous/);
    expect(() => composeFirstFusion({ buildProject: build(), loftProject: { ...loft(), units: 'm' } }))
      .toThrow(/millimetre/);
  });
  it('rejects invalid Loft topology references rather than inventing geometry', () => {
    const broken = loft();
    broken.assemblies[0]!.instances[0]!.partId = 'Missing';
    expect(() => composeFirstFusion({ buildProject: build(), loftProject: broken })).toThrow(/missing part/);
  });
});
