import { describe, expect, it } from 'vitest';
import { parsePirDocument } from '@spds/parametric-ir';
import { createFaceDraftPreviewLowerer } from './face-draft-preview.js';

describe('face draft preview lowerer', () => {
  it('lowers selected semantic faces and a neutral plane', () => {
    const operation = parsePirDocument({
      schemaVersion: 'pir/1',
      id: 'pir:face-draft',
      operations: [
        {
          id: 'pir:face-draft-op',
          op: 'form',
          operator: 'solid.face-draft@1.0.0',
          semanticOwner: 'part:drafted',
          inputs: {},
          produces: {
            role: 'part:solid',
            form: {
              kind: 'geometry',
              geometryType: 'solid',
              capabilities: ['preview.face-draft'],
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
    const facePath = 'part:source/profile:extrude/face:side:0000';
    const ops = createFaceDraftPreviewLowerer().lower({
      operation,
      parameters: {},
      output: {
        parts: [
          {
            id: 'part:drafted',
            sourceOperationId: 'pir:extrude',
            selectedFacePaths: [facePath],
            pullDirection: [0, 0, 1],
            neutralPlaneOrigin: [0, 0, 0],
            neutralPlaneNormal: [0, 0, 1],
            angleDeg: 5,
          },
        ],
      },
    });
    expect(ops[0]).toMatchObject({
      op: 'geometry.face-draft@1.0.0',
      selectedFacePaths: [facePath],
      pullDirection: [0, 0, 1],
      neutralPlaneOrigin: [0, 0, 0],
      angleDeg: 5,
      reverse: false,
    });
  });
});
