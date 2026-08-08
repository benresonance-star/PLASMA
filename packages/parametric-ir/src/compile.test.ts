import { describe, expect, it } from 'vitest';
import { resolveEffectiveState, parseCompositionDocument } from '@spds/composition-core';
import { parsePirDocument } from './schema.js';
import { compilePirFromEffectiveState, hashPir } from './compile.js';

const universe = [
  {
    id: 'topology:root',
    semanticType: 'structural.topology-root',
    tags: ['primary'],
    capabilities: ['emit.cells'],
  },
] as const;

describe('G3A.4 PIR', () => {
  it('compiles inspectable hashable PIR with semantic owners', () => {
    const effective = resolveEffectiveState(
      parseCompositionDocument({
        id: 'composition:d01',
        publishedBaseId: 'pattern:goldberg@1.0.0',
        publishedBaseImmutable: true,
        layers: [{ layer: 'base', overrides: [{ path: 'params.frequency', value: 2 }] }],
        objects: { params: { frequency: 1, diameterMm: 20000 } },
      }),
    );
    const a = compilePirFromEffectiveState({
      effective,
      patternInstanceId: 'pattern-instance:fixed',
      selectableUniverse: universe,
    });
    const b = compilePirFromEffectiveState({
      effective,
      patternInstanceId: 'pattern-instance:fixed',
      selectableUniverse: universe,
    });
    expect(a.pirHash).toBe(b.pirHash);
    expect(a.pir.operations.every((op) => op.semanticOwner.length > 0)).toBe(true);
    expect(hashPir(a.pir)).toBe(a.pirHash);
  });

  it('rejects embedded JavaScript in PIR', () => {
    expect(() =>
      parsePirDocument({
        schemaVersion: 'pir/1',
        id: 'pir:bad',
        operations: [
          {
            id: 'pir:x',
            op: 'eval',
            operator: 'bad@1',
            semanticOwner: 'x',
            inputs: { js: { value: 'return 1' } },
            provenance: { patternInstance: 'p', compositionHash: 'h' },
            dependsOn: [],
          },
        ],
      }),
    ).toThrow(/JavaScript/);
  });
});
