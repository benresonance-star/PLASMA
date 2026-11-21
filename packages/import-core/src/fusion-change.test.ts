import { describe, expect, it } from 'vitest';
import { composeFirstFusion } from './fusion.js';
import { proposeFirstFusionChange, type FusionChangeInput } from './fusion-change.js';

const at = '2026-11-21T00:00:00.000Z';
function sourcePair() {
  const buildProject = { app: 'Build', schemaVersion: 2, savedAt: at,
    authoritativeGraph: {
      entities: [
        { id: 'entity:build:wall', kind: 'Entity', semanticType: 'architecture.wall', name: 'Wall',
          createdAt: at, updatedAt: at, schemaVersion: '1.0.0' },
      ],
      parameters: [
        { id: 'parameter:build:width', kind: 'Parameter', semanticType: 'architecture.width',
          name: 'Window width', createdAt: at, updatedAt: at, schemaVersion: '1.0.0',
          quantity: { value: 1500, unit: 'mm' }, role: 'design-variable',
          domain: { min: 900, max: 2400 }, affects: ['entity:build:wall'],
          editableBy: ['user', 'agent'] },
      ],
      relationships: [],
    },
  };
  const loftProject = { id: 'LoftTest', schemaVersion: 2, units: 'mm',
    parts: [{ id: 'Head', parameters: { W: 1500 }, features: [] }],
    rootAssembly: 'Site', assemblies: [{ id: 'Site',
      instances: [
        { id: 'Head1', partId: 'Head', placement: { translation: [0,0,0] } },
        { id: 'Head2', partId: 'Head', placement: { translation: [1800,0,0] } },
      ],
    }],
  };
  const bindings = [{ buildEntityId: 'entity:build:wall', loftAssemblyId: 'Site', loftInstanceId: 'Head1' }];
  const f = composeFirstFusion({ buildProject, loftProject, bindings });
  const expectedSourceHashes = {
    build: f.sources[0]!.sourceHash, loft: f.sources[1]!.sourceHash,
  };
  const input: FusionChangeInput = {
    buildProject, loftProject, bindings, expectedSourceHashes,
    buildParameterId: 'parameter:build:width',
    nextValue: 1800,
    loftLink: {
      loftAssemblyId: 'Site', loftInstanceId: 'Head1',
      loftPartId: 'Head', loftParameter: 'W',
    },
  };
  return { input };
}
describe('FUSION-02 guarded cross-application parameter preview', () => {
  it('proposes one param edit and invalidates every occurrence of its shared Loft definition', () => {
    const { input } = sourcePair();
    const result = proposeFirstFusionChange(input);
    expect(result).toMatchObject({
      status: 'proposed-only', committed: false, geometryCompiled: false,
      parameter: { before: 1500, after: 1800, unit: 'mm' },
      loftParameter: { partId: 'Head', parameter: 'W', before: 1500, after: 1800 },
    });
    expect(result.impactedBuildEntities).toEqual(['entity:build:wall']);
    expect(result.impactedLoftOccurrences).toHaveLength(2);
  });
  it('rejects stale source hashes and out-of-domain changes', () => {
    const { input } = sourcePair();
    expect(() => proposeFirstFusionChange({ ...input,
      expectedSourceHashes: { ...input.expectedSourceHashes, loft: 'stale' } }))
      .toThrow(/SOURCE_STALE/);
    expect(() => proposeFirstFusionChange({ ...input, nextValue: 3000 }))
      .toThrow(/OUT_OF_DOMAIN/);
  });
  it('refuses unknown or unbound implicit parameter correspondence', () => {
    const { input } = sourcePair();
    expect(() => proposeFirstFusionChange({
      ...input, loftLink: { ...input.loftLink!, loftInstanceId: 'Head2' },
    })).toThrow(/LINK_NOT_BOUND/);
    expect(() => proposeFirstFusionChange({
      ...input, loftLink: { ...input.loftLink!, loftPartId: 'Missing' },
    })).toThrow(/LINK_PART_MISMATCH/);
  });
  it('refuses a mismatched initial value, preserving typed source authority', () => {
    const { input } = sourcePair();
    const loftProject = structuredClone(input.loftProject) as {
      parts: { parameters: { W: number } }[];
    };
    loftProject.parts[0]!.parameters.W = 1400;
    const fusion = composeFirstFusion({
      buildProject: input.buildProject, loftProject, bindings: input.bindings,
    });
    expect(() => proposeFirstFusionChange({
      ...input, loftProject,
      expectedSourceHashes: {
        build: fusion.sources[0]!.sourceHash, loft: fusion.sources[1]!.sourceHash,
      },
    })).toThrow(/BASE_VALUES_DIFFER/);
  });
  it('does not mutate input sources', () => {
    const { input } = sourcePair();
    const original = JSON.stringify(input);
    proposeFirstFusionChange(input);
    expect(JSON.stringify(input)).toBe(original);
  });
});
