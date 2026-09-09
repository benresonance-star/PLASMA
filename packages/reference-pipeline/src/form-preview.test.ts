import { describe, expect, it } from 'vitest';
import { parsePirDocument } from '@spds/parametric-ir';
import {
  createProfileLoftPreviewLowerer,
  createProfileRevolvePreviewLowerer,
} from './form-preview.js';

function operation(capability: string) {
  return parsePirDocument({
    schemaVersion: 'pir/1',
    id: `pir:${capability}`,
    operations: [
      {
        id: `pir:op:${capability}`,
        op: 'form',
        operator: 'form@1.0.0',
        semanticOwner: 'part:test',
        inputs: {},
        produces: {
          role: 'part:solid',
          form: {
            kind: 'geometry',
            geometryType: 'solid',
            capabilities: [capability],
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
}

describe('revolve and loft preview lowerers', () => {
  it('lowers profile revolve products', () => {
    const ops = createProfileRevolvePreviewLowerer().lower({
      operation: operation('preview.profile-revolve'),
      parameters: {},
      output: {
        parts: [
          {
            id: 'part:revolve',
            profile: [
              [20, 0, 0],
              [50, 0, 0],
              [50, 0, 100],
              [20, 0, 100],
            ],
            axisOrigin: [0, 0, 0],
            axisDirection: [0, 0, 1],
            angleDeg: 360,
          },
        ],
      },
    });
    expect(ops[0]?.op).toBe('geometry.revolve@1.0.0');
  });

  it('lowers ruled profile loft products', () => {
    const profiles = [
      [
        [-5, -5, 0],
        [5, -5, 0],
        [5, 5, 0],
        [-5, 5, 0],
      ],
      [
        [-10, -10, 100],
        [10, -10, 100],
        [10, 10, 100],
        [-10, 10, 100],
      ],
    ] as const;
    const ops = createProfileLoftPreviewLowerer().lower({
      operation: operation('preview.profile-loft'),
      parameters: {},
      output: { parts: [{ id: 'part:loft', profiles }] },
    });
    expect(ops[0]?.op).toBe('geometry.loft@1.0.0');
  });
});
