/**
 * S22 — Draft → bind pending (no mesh change) → Accept bind updates meshes + params.
 * Uses session harness (no live API).
 */

import { describe, expect, it } from 'vitest';
import { PARAM_D01_LENGTH_ID } from '@spds/ai-interface';
import {
  appBindAcceptSuccess,
  appBindAgentRun,
  appBindPendingDraft,
  createAppSession,
} from './app-session.js';
import { draftUpdateLengthMm } from './schema-draft.js';
import type { DisplayMeshInput } from './mesh-bridge.js';

function mesh(owner: string, fingerprint: string): DisplayMeshInput {
  return {
    representationId: `rep:${fingerprint}`,
    semanticOwner: owner,
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
    indices: [0, 1, 2],
  };
}

describe('known-model AI gate (S22)', () => {
  it('Draft does not mutate meshes; Accept does', () => {
    let session = {
      ...createAppSession(),
      modelId: 'model:d01',
      branchId: 'branch:main',
      aiBranchId: 'branch:ai:d01',
      headHash: 'hash:head',
    };
    const beforeMeshes = session.g8.meshes.length;
    const draft = draftUpdateLengthMm(
      {
        modelId: session.modelId,
        branchId: session.aiBranchId,
        headHash: session.headHash,
      },
      2100,
      42,
    );
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    session = appBindPendingDraft(session, draft.pending);
    expect(session.pendingChangeSet?.commands[0]?.payload).toEqual({ lengthMm: 2100 });
    expect(session.g8.meshes.length).toBe(beforeMeshes);

    const afterMeshes = [mesh('component:y:0000', 'after-2100')];
    session = appBindAcceptSuccess(
      session,
      {
        pipelineHash: 'pipe:accepted',
        lengthMmOverride: 2100,
        armWidthMm: 80,
        structuralDepthMm: 40,
        meshes: afterMeshes,
        whyExplain: `${PARAM_D01_LENGTH_ID} → component:y:0000`,
      },
      Date.now(),
    );
    expect(session.pendingChangeSet).toBeNull();
    expect(session.params.lengthMm).toBe(2100);
    expect(session.g8.meshes[0]?.semanticOwner).toBe('component:y:0000');
    expect(session.whyLine).toMatch(/armWidthMm/);
    expect(session.whyLine).toMatch(/Why:/);
  });

  it('agent bind stores agentContext acceptOps (S19)', () => {
    const session = appBindAgentRun(createAppSession(), {
      status: 'succeeded',
      mode: 'scripted',
      note: 'ok',
      liveCompile: { ok: true, pipelineHash: 'pipe:1' },
      changesView: [],
      why: { explanation: 'demo' },
      audit: { intent: 'length', toolCalls: ['propose'] },
      agentContext: {
        mutate: {
          acceptOps: ['update', 'create', 'apply_pattern'],
          unsupportedOps: ['delete'],
          kindsAllowlist: ['ui.folder'],
          parameters: [
            {
              id: PARAM_D01_LENGTH_ID,
              path: 'lengthMm',
              domain: { min: 500, max: 4000 },
            },
          ],
          examples: [],
        },
        world: { viewportNote: 'WORLD +Z' },
      },
    });
    expect(session.agentContext?.mutate.acceptOps).toContain('update');
    expect(session.agentContext?.mutate.acceptOps).not.toContain('delete');
  });
});
