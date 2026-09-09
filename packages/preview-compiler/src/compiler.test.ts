import { describe, expect, it } from 'vitest';
import { parsePirDocument } from '@spds/parametric-ir';
import { PreviewLowererRegistry, compilePreviewRequest } from './compiler.js';

const pir = parsePirDocument({
  schemaVersion: 'pir/1',
  id: 'pir:test',
  operations: [
    {
      id: 'pir:source',
      op: 'make-form',
      operator: 'form.make@1.0.0',
      semanticOwner: 'form:1',
      inputs: {},
      produces: {
        role: 'form:solid',
        form: {
          kind: 'geometry',
          geometryType: 'solid',
          capabilities: ['preview.test'],
        },
      },
      provenance: {
        patternInstance: 'pattern-instance:test',
        compositionHash: 'hash:test',
      },
      dependsOn: [],
    },
  ],
});

describe('capability-based preview compiler', () => {
  it('lowers Form IR products without model-specific dispatch', () => {
    const registry = new PreviewLowererRegistry();
    registry.register({
      capability: 'preview.test',
      lower: ({ operation }) => [
        {
          op: 'geometry.sweep@1.0.0',
          semanticOwner: operation.semanticOwner,
          pirOperationId: `${operation.id}:preview`,
          path: [
            [0, 0, 0],
            [100, 0, 0],
          ],
          profileWidthMm: 10,
          profileDepthMm: 20,
        },
      ],
    });

    const request = compilePreviewRequest({
      pir,
      pirHash: 'pir-hash',
      dagHash: 'dag-hash',
      outputs: new Map([['pir:source', { value: 'operator-output' }]]),
      registry,
      parameters: { scale: 1 },
    });

    expect(request.ops).toHaveLength(1);
    expect(request.ops[0]?.semanticOwner).toBe('form:1');
    expect(request.snapshotHash).toMatch(/^snapshot:preview:/);
  });

  it('fails when a preview-capable operator output is unavailable', () => {
    const registry = new PreviewLowererRegistry();
    registry.register({ capability: 'preview.test', lower: () => [] });
    expect(() =>
      compilePreviewRequest({
        pir,
        pirHash: 'pir-hash',
        dagHash: 'dag-hash',
        outputs: new Map(),
        registry,
      }),
    ).toThrow(/output missing/);
  });
});
