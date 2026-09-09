import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWhatIfPreview } from './api-client.js';

describe('runWhatIfPreview ChangeSet body (S12)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts draft.changeSet commands', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        whatIf: {
          baselineHash: 'hash:base',
          previewHash: 'hash:preview',
          mode: 'regenerated-preview',
          previewMeshOwners: ['component:y:0000'],
        },
        meshes: [],
        pipelineHash: 'pipe:1',
        regenMs: 12,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await runWhatIfPreview({
      modelId: 'model:d01',
      branchId: 'branch:ai',
      baselineHash: 'hash:base',
      draft: {
        changeSet: {
          changeSetId: 'cs:1',
          commands: [{ op: 'update', targetId: 'param:d01:length', payload: { lengthMm: 2100 } }],
        },
      },
      yLimit: 3,
    });

    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(init.body ?? '{}') as {
      draft: { changeSet: { commands: unknown[] } };
    };
    expect(body.draft.changeSet.commands).toHaveLength(1);
  });

  it('surfaces failureCode from error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({
          failureCode: 'UNSUPPORTED_OP',
          reason: 'delete not allowed',
        }),
      })),
    );
    await expect(
      runWhatIfPreview({
        modelId: 'model:d01',
        branchId: 'branch:ai',
        baselineHash: 'hash:base',
        draft: {
          changeSet: {
            changeSetId: 'cs:bad',
            commands: [{ op: 'delete', targetId: 'x' }],
          },
        },
      }),
    ).rejects.toThrow(/delete|UNSUPPORTED/);
  });
});
