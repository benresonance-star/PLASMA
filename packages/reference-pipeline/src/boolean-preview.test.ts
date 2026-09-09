import { describe, expect, it } from 'vitest';
import { parsePirDocument } from '@spds/parametric-ir';
import { createBooleanSolidPreviewLowerer } from './boolean-preview.js';

describe('Boolean solid preview lowerer', () => {
  it('preserves ordered compile-operation dependencies', () => {
    const operation = parsePirDocument({
      schemaVersion: 'pir/1',
      id: 'pir:boolean',
      operations: [
        {
          id: 'pir:boolean-op',
          op: 'boolean',
          operator: 'solid.boolean@1.0.0',
          semanticOwner: 'part:result',
          inputs: {},
          produces: {
            role: 'part:solid',
            form: {
              kind: 'geometry',
              geometryType: 'solid',
              capabilities: ['preview.boolean-solid'],
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
    const ops = createBooleanSolidPreviewLowerer().lower({
      operation,
      parameters: {},
      output: {
        parts: [
          {
            id: 'part:result',
            operation: 'cut',
            leftOperationId: 'pir:left',
            rightOperationId: 'pir:right',
          },
        ],
      },
    });
    expect(ops[0]).toMatchObject({
      op: 'geometry.boolean@1.0.0',
      operation: 'cut',
      leftOperationId: 'pir:left',
      rightOperationId: 'pir:right',
    });
  });
});
