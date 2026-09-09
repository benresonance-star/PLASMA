import { describe, expect, it } from 'vitest';
import { parsePirDocument } from '@spds/parametric-ir';
import { createPlanarProfileExtrudePreviewLowerer } from './planar-extrude-preview.js';

describe('planar profile extrusion preview lowerer', () => {
  it('lowers package output without embedding kernel classes', () => {
    const operation = parsePirDocument({
      schemaVersion: 'pir/1',
      id: 'pir:test',
      operations: [
        {
          id: 'pir:panel',
          op: 'panel-extrude',
          operator: 'panel.extrude@1.0.0',
          semanticOwner: 'panel:1',
          inputs: {},
          produces: {
            role: 'panel:solid',
            form: {
              kind: 'geometry',
              geometryType: 'solid',
              capabilities: ['preview.planar-profile-extrude'],
            },
          },
          provenance: {
            patternInstance: 'pattern-instance:test',
            compositionHash: 'hash:test',
          },
          dependsOn: [],
        },
      ],
    }).operations[0]!;
    const ops = createPlanarProfileExtrudePreviewLowerer().lower({
      operation,
      parameters: {},
      output: {
        parts: [
          {
            id: 'panel:1',
            profile: [
              [0, 0, 0],
              [10, 0, 0],
              [10, 10, 0],
              [0, 10, 0],
            ],
            vector: [0, 0, 2],
          },
        ],
      },
    });
    expect(ops).toHaveLength(1);
    expect(ops[0]?.op).toBe('geometry.extrude@1.0.0');
    expect(ops[0]?.featurePath).toBe('profile:extrude');
  });
});
