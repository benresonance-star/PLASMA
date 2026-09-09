import { describe, expect, it } from 'vitest';
import type { WhatIfDraftRejectedError } from './what-if-regen.js';
import {
  WhatIfCloneRejectedError,
  assertWhatIfNotCloned,
  meshByteFingerprint,
  meshExtents,
  regenerateWhatIfPreview,
} from './what-if-regen.js';

describe('F1 what-if regenerate', () => {
  it('F1a/F1b: fork draft regenerates; baseline hash unchanged; clone fails closed', async () => {
    const baselineHash = 'hash:baseline:1';
    const t0 = performance.now();
    const a = await regenerateWhatIfPreview({
      request: {
        modelId: 'm1',
        branchId: 'b1',
        draft: { parameterId: 'param:d01:lengthMm', value: 2100 },
      },
      baselineHash,
      yLimit: 2,
    });
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(a.whatIf.baselineHash).toBe(baselineHash);
    expect(a.whatIf.previewHash).not.toBe(baselineHash);
    expect(a.whatIf.mode).toBe('regenerated-preview');
    expect(a.meshes.length).toBeGreaterThan(0);

    const b = await regenerateWhatIfPreview({
      request: {
        modelId: 'm1',
        branchId: 'b1',
        draft: { parameterId: 'param:d01:lengthMm', value: 2600 },
      },
      baselineHash,
      baselineMeshes: a.meshes,
      yLimit: 2,
    });
    expect(b.byteFingerprint).not.toBe(a.byteFingerprint);
    expect(meshExtents(b.meshes).max[0]).not.toBe(meshExtents(a.meshes).max[0]);

    expect(() =>
      assertWhatIfNotCloned({ mode: 'cloned-buffers' }),
    ).toThrow(WhatIfCloneRejectedError);
    expect(() =>
      assertWhatIfNotCloned({
        baselineMeshes: a.meshes,
        previewMeshes: a.meshes,
      }),
    ).toThrow(WhatIfCloneRejectedError);

    await expect(
      regenerateWhatIfPreview({
        request: {
          modelId: 'm1',
          branchId: 'b1',
          draft: { parameterId: 'param:d01:lengthMm', value: 2200 },
        },
        baselineHash,
        modeAttempt: 'cloned-buffers',
      }),
    ).rejects.toBeInstanceOf(WhatIfCloneRejectedError);

    expect(meshByteFingerprint(a.meshes).length).toBeGreaterThan(0);
  }, 20_000);

  it('T7: ChangeSet draft regenerates preview; unsupported op fails structured', async () => {
    const baselineHash = 'hash:baseline:cs';
    const t0 = performance.now();
    const preview = await regenerateWhatIfPreview({
      request: {
        modelId: 'm1',
        branchId: 'b1',
        draft: {
          changeSet: {
            changeSetId: 'cs:whatif:1',
            transactionId: 'txn:whatif',
            expectedHeadHash: 'head:whatif',
            commands: [
              { op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 2150 } },
            ],
          },
        },
      },
      baselineHash,
      yLimit: 3,
    });
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(preview.whatIf.mode).toBe('regenerated-preview');
    expect(preview.pipelineHash).toBeTruthy();
    expect(preview.whatIf.previewHash).not.toBe(baselineHash);

    await expect(
      regenerateWhatIfPreview({
        request: {
          modelId: 'm1',
          branchId: 'b1',
          draft: {
            changeSet: {
              changeSetId: 'cs:whatif:bad',
              transactionId: 'txn:whatif',
              expectedHeadHash: 'head:whatif',
              commands: [{ op: 'delete', targetId: 'y:demo:01' }],
            },
          },
        },
        baselineHash,
        yLimit: 2,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_OP' } satisfies Partial<WhatIfDraftRejectedError>);
  }, 20_000);
});
