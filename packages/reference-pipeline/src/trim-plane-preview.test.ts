import { describe, expect, it } from 'vitest';
import { parsePirDocument } from '@spds/parametric-ir';
import { createTrimPlanePreviewLowerer } from './trim-plane-preview.js';

describe('plane trim preview lowerer', () => {
  it('preserves source dependency and half-space selection', () => {
    const operation = parsePirDocument({
      schemaVersion: 'pir/1',
      id: 'pir:trim',
      operations: [
        {
          id: 'pir:trim-op',
          op: 'trim',
          operator: 'solid.trim-plane@1.0.0',
          semanticOwner: 'part:trimmed',
          inputs: {},
          produces: {
            role: 'part:solid',
            form: {
              kind: 'geometry',
              geometryType: 'solid',
              capabilities: ['preview.trim-plane'],
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
    const ops = createTrimPlanePreviewLowerer().lower({
      operation,
      parameters: {},
      output: {
        parts: [
          {
            id: 'part:trimmed',
            sourceOperationId: 'pir:source',
            planeOrigin: [5, 0, 0],
            planeNormal: [1, 0, 0],
            keep: 'positive',
          },
        ],
      },
    });
    expect(ops[0]).toMatchObject({
      op: 'geometry.trim-plane@1.0.0',
      sourceOperationId: 'pir:source',
      keep: 'positive',
    });
  });
});
