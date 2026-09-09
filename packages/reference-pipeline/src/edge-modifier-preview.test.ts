import { describe, expect, it } from 'vitest';
import { parsePirDocument } from '@spds/parametric-ir';
import { createEdgeModifierPreviewLowerer } from './edge-modifier-preview.js';

describe('edge modifier preview lowerer', () => {
  it('lowers semantic edge paths to fillet and chamfer operations', () => {
    const operation = parsePirDocument({
      schemaVersion: 'pir/1',
      id: 'pir:modifiers',
      operations: [
        {
          id: 'pir:modifier-op',
          op: 'form',
          operator: 'solid.edge-modifier@1.0.0',
          semanticOwner: 'part:modified',
          inputs: {},
          produces: {
            role: 'part:solid',
            form: {
              kind: 'geometry',
              geometryType: 'solid',
              capabilities: ['preview.edge-modifier'],
            },
          },
          provenance: {
            patternInstance: 'pattern-instance:test',
            compositionHash: 'hash:test',
          },
          dependsOn: ['pir:extrude'],
        },
      ],
    }).operations[0]!;
    const edgePath = 'part:source/profile:extrude/edge:rail:0000';
    const ops = createEdgeModifierPreviewLowerer().lower({
      operation,
      parameters: {},
      output: {
        parts: [
          {
            id: 'part:filleted',
            modifier: 'fillet',
            sourceOperationId: 'pir:extrude',
            edgePaths: [edgePath],
            radiusMm: 4,
          },
          {
            id: 'part:chamfered',
            modifier: 'chamfer',
            sourceOperationId: 'pir:extrude',
            edgePaths: [edgePath],
            distanceMm: 3,
          },
        ],
      },
    });
    expect(ops).toMatchObject([
      {
        op: 'geometry.edge-fillet@1.0.0',
        sourceOperationId: 'pir:extrude',
        edgePaths: [edgePath],
        radiusMm: 4,
      },
      {
        op: 'geometry.edge-chamfer@1.0.0',
        sourceOperationId: 'pir:extrude',
        edgePaths: [edgePath],
        distanceMm: 3,
      },
    ]);
  });
});
