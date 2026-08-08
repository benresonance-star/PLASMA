import { describe, expect, it } from 'vitest';
import {
  F01_PANEL_SEMANTIC_ID,
  appAnalysisIndicative,
  appApplyAiChange,
  appBindAcceptFailure,
  appBindAcceptSuccess,
  appBindAgentRun,
  appCommitExactLength,
  appExplorerIds,
  appNavigateIssue,
  appPreviewLength,
  appPrimarySemanticId,
  appSelect,
  appSelectionSynced,
  appSetPanel,
  appSwitchModelKind,
  createAppSession,
} from './app-session.js';

describe('G9–G15 integrated designer session', () => {
  it('G9: pipeline/deps/validation navigate to semantic owners', () => {
    let session = createAppSession();
    session = appSelect(session, appPrimarySemanticId(), 'explorer', 1);
    expect(session.pipeline.stages.length).toBeGreaterThan(0);
    expect(session.deps.downstream.length).toBeGreaterThan(0);
    session = appSetPanel(session, 'validation');
    session = appNavigateIssue(session, 'iss:demo:edge', 2);
    expect(session.validation.focusedSemanticId).toBe(appPrimarySemanticId());
    expect(appSelectionSynced(session)).toBe(true);
  });

  it('G12: history and compare update after exact regen', () => {
    let session = createAppSession();
    session = appSelect(session, appPrimarySemanticId(), 'viewport', 1);
    session = appPreviewLength(session, 300);
    session = appCommitExactLength(session, 2);
    expect(session.history.entries.some((e) => e.label === 'ExactRegen')).toBe(true);
    expect(session.compare.changedIds).toContain(appPrimarySemanticId());
    expect(session.restore.destroysLaterHistory).toBe(false);
  });

  it('G13/G15: AI panel + indicative analysis labels', () => {
    let session = createAppSession();
    expect(appAnalysisIndicative(session)).toBe(true);
    session = appApplyAiChange(session);
    expect(session.aiChanges[0]?.disposition).toBe('applied');
    expect(session.whyLine).toMatch(/Accept & rebuild|Local disposition/i);
  });

  it('binds live agent run into AI panel without claiming geometry mutation', () => {
    let session = createAppSession();
    session = appBindAgentRun(session, {
      status: 'succeeded',
      mode: 'scripted',
      note: 'Scripted proposal. Geometry changes only after Accept & rebuild.',
      liveCompile: { ok: true, pipelineHash: 'pipe:abcdef12' },
      changesView: [
        {
          changeSetId: 'cs:live:1',
          disposition: 'proposed',
          commandCount: 1,
          attribution: 'ai',
        },
      ],
      why: { explanation: 'y:demo:01 produced by pattern' },
      audit: { intent: 'shorten', toolCalls: ['summary', 'compile'] },
      applied: {
        changeSetId: 'cs:live:1',
        branchId: 'branch:ai-agent',
        expectedHeadHash: 'head:1',
        transactionId: 'txn:1',
        commands: [{ op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 8 } }],
        actor: 'ai',
        disposition: 'applied',
      },
    });
    expect(session.aiChanges[0]?.changeSetId).toBe('cs:live:1');
    expect(session.pendingChangeSet?.commands[0]?.payload).toEqual({ lengthMm: 8 });
    expect(session.whyLine).toMatch(/scripted\/succeeded/);
    expect(session.whyLine).toMatch(/liveCompile=ok/);
  });

  it('accept success swaps meshes; failure leaves meshes', () => {
    let session = createAppSession();
    const before = session.g8.meshes[0]?.vertices.length ?? 0;
    session = appBindAcceptFailure(session, { failureCode: 'HEAD_CONFLICT', reason: 'stale' });
    expect(session.g8.meshes[0]?.vertices.length).toBe(before);
    expect(session.whyLine).toMatch(/HEAD_CONFLICT/);
    session = appBindAcceptSuccess(
      session,
      {
        pipelineHash: 'pipe:accept01',
        lengthMmOverride: 9,
        meshes: [
          {
            representationId: 'rep:1',
            semanticOwner: appPrimarySemanticId(),
            vertices: [
              [0, 0, 0],
              [1, 0, 0],
              [0, 1, 0],
            ],
            indices: [0, 1, 2],
          },
        ],
      },
      99,
    );
    expect(session.g8.meshes[0]?.vertices).toHaveLength(3);
    expect(session.pendingChangeSet).toBeNull();
    expect(session.pattern.parameters.lengthMm).toBe(9);
  });


  it('G14.4: F01 model switches without dome-specific code path', () => {
    let session = createAppSession();
    session = appSwitchModelKind(session, 'f01', 5);
    expect(session.modelKind).toBe('f01');
    expect(session.pattern.patternId).toBe('pattern:FreeformPanelSet');
    expect(appExplorerIds(session)).toEqual([F01_PANEL_SEMANTIC_ID]);
    expect(session.g8.meshes[0]?.semanticOwner).toBe(F01_PANEL_SEMANTIC_ID);
  });
});
