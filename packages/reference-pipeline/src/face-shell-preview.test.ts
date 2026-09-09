import { describe, expect, it } from 'vitest';
import { parsePirDocument } from '@spds/parametric-ir';
import { createFaceShellPreviewLowerer } from './face-shell-preview.js';

describe('face shell preview lowerer', () => {
  it('lowers removed semantic faces to an open shell operation', () => {
    const operation = parsePirDocument({
      schemaVersion: 'pir/1',
      id: 'pir:face-shell',
      operations: [
        {
          id: 'pir:face-shell-op',
          op: 'form',
          operator: 'solid.face-shell@1.0.0',
          semanticOwner: 'part:shell',
          inputs: {},
          produces: {
            role: 'part:solid',
            form: {
              kind: 'geometry',
              geometryType: 'solid',
              capabilities: ['preview.face-shell'],
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
    const facePath = 'part:source/profile:extrude/face:profile-end';
    const ops = createFaceShellPreviewLowerer().lower({
      operation,
      parameters: {},
      output: {
        parts: [
          {
            id: 'part:shell',
            sourceOperationId: 'pir:extrude',
            removedFacePaths: [facePath],
            thicknessMm: 2,
          },
        ],
      },
    });
    expect(ops[0]).toMatchObject({
      op: 'geometry.face-shell@1.0.0',
      sourceOperationId: 'pir:extrude',
      removedFacePaths: [facePath],
      thicknessMm: 2,
      inward: true,
    });
  });
});
