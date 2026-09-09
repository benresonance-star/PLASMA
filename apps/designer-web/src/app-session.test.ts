import { describe, expect, it } from 'vitest';
import {
  F01_PANEL_SEMANTIC_ID,
  appAnalysisIndicative,
  appApplyAiChange,
  appBindAcceptFailure,
  appBindAcceptSuccess,
  appBindAgentRun,
  appBootstrapFailure,
  appBootstrapSuccess,
  appCommitExactLength,
  appExplorerCreate,
  appExplorerDelete,
  appExplorerIds,
  appExplorerReorder,
  appExplorerSelect,
  appNavigateIssue,
  appPreviewLength,
  appPrimarySemanticId,
  appSelect,
  appSelectionSynced,
  appApplyLiveDisplayMeshes,
  appSetExplorerGraphObjects,
  appSetPanel,
  appSwitchModelKind,
  createAppSession,
} from './app-session.js';
import { EXPLORER_ROOT_ID, explorerChildren } from './explorer-tree.js';

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
    session = appPreviewLength(session, 3000);
    session = appCommitExactLength(session, 2);
    expect(session.timeline.some((e) => e.label === 'ExactRegen')).toBe(true);
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
        commands: [{ op: 'update', targetId: 'y:demo:01', payload: { lengthMm: 2000 } }],
        actor: 'ai',
        disposition: 'applied',
      },
    });
    expect(session.aiChanges[0]?.changeSetId).toBe('cs:live:1');
    expect(session.pendingChangeSet?.commands[0]?.payload).toEqual({ lengthMm: 2000 });
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
        lengthMmOverride: 2000,
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
    expect(session.g8.meshSource).toBe('live');
    expect(session.pendingChangeSet).toBeNull();
    expect(session.pattern.parameters.lengthMm).toBe(2000);
  });

  it('G14.4: F01 model switches without dome-specific code path', () => {
    let session = createAppSession();
    session = appSwitchModelKind(session, 'f01', 5);
    expect(session.modelKind).toBe('f01');
    expect(session.pattern.patternId).toBe('pattern:FreeformPanelSet');
    expect(appExplorerIds(session)).toEqual([F01_PANEL_SEMANTIC_ID]);
    expect(session.g8.meshes[0]?.semanticOwner).toBe(F01_PANEL_SEMANTIC_ID);
  });

  it('live meshes drive explorer + selection; D01 switch does not clobber live', () => {
    let session = createAppSession();
    session = appBootstrapSuccess(
      session,
      {
        modelId: 'model:live',
        branchId: 'branch:main',
        headHash: 'hash:1',
        explorerIds: ['y:demo:01'],
        pipelineHash: 'pipe:live01',
        lengthMm: 2300,
        meshes: [
          {
            representationId: 'rep:y0',
            semanticOwner: 'component:y:0000',
            vertices: [
              [0, 0, 0],
              [1, 0, 0],
              [0, 1, 0],
            ],
            indices: [0, 1, 2],
          },
          {
            representationId: 'rep:y1',
            semanticOwner: 'component:y:0001',
            vertices: [
              [0, 0, 0],
              [1, 0, 0],
              [0, 1, 0],
            ],
            indices: [0, 1, 2],
          },
          {
            representationId: 'rep:y2',
            semanticOwner: 'component:y:0002',
            vertices: [
              [0, 0, 0],
              [1, 0, 0],
              [0, 1, 0],
            ],
            indices: [0, 1, 2],
          },
        ],
      },
      10,
    );
    expect(session.g8.meshSource).toBe('live');
    expect(session.g8.meshes).toHaveLength(3);
    expect(appExplorerIds(session)).toEqual([
      'component:y:0000',
      'component:y:0001',
      'component:y:0002',
    ]);
    expect(session.g8.selection.selectedSemanticId).toBe('component:y:0000');
    session = appSwitchModelKind(session, 'd01', 11);
    expect(session.g8.meshSource).toBe('live');
    expect(session.g8.meshes).toHaveLength(3);
  });

  it('W0.2 bootstrap success sets live explorer; failure stays offline', () => {
    let session = createAppSession();
    expect(session.liveBinding.explorerFromApi).toBe(false);
    session = appBootstrapSuccess(
      session,
      {
        modelId: 'model:live',
        branchId: 'branch:main',
        headHash: 'hash:1',
        explorerIds: ['y:live:01', 'y:live:02'],
        pipelineHash: 'pipe:live01',
        lengthMm: 2400,
      },
      10,
    );
    expect(session.liveBinding.explorerFromApi).toBe(true);
    expect(appExplorerIds(session)).toEqual(['y:live:01', 'y:live:02']);
    expect(session.pipeline.dagId).not.toContain('demo');
    session = appBootstrapFailure(session);
    expect(session.publicationStatus).toBe('offline');
  });

  it('W0.2 reducer bench: 1k ops under 100ms', () => {
    let session = createAppSession();
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      session = appSelect(session, appPrimarySemanticId(), 'explorer', i);
    }
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it('explorer tree: branch CRUD/reorder and selection maps to semantic id', () => {
    let session = createAppSession();
    expect(explorerChildren(session.explorerTree, EXPLORER_ROOT_ID).length).toBeGreaterThan(0);
    session = appExplorerCreate(session, { parentId: EXPLORER_ROOT_ID, label: 'Extra' }, 20);
    expect(session.g8.selection.selectedSemanticId).toBeTruthy();
    const createdId = session.g8.selection.selectedSemanticId!;
    const before = appExplorerIds(session);
    session = appExplorerReorder(session, createdId, -1);
    expect(appExplorerIds(session).sort()).toEqual([...before].sort());
    session = appExplorerSelect(session, `body:${createdId}`, 21);
    expect(session.g8.selection.selectedSemanticId).toBe(createdId);
    session = appExplorerDelete(session, createdId, 22);
    expect(appExplorerIds(session)).not.toContain(createdId);
    expect(session.g8.selection.selectedSemanticId).toBeNull();
  });

  it('explorer folders survive live mesh apply via graph projection', () => {
    let session = createAppSession();
    session = appBootstrapSuccess(
      session,
      {
        modelId: 'model:folder-merge',
        branchId: 'branch:1',
        headHash: 'head:1',
        explorerIds: ['component:y:0000', 'component:y:0001'],
        explorerGraphObjects: [
          {
            id: 'folder:bay',
            semanticType: 'ui.folder',
            tags: ['ui.folder'],
            attributes: { label: 'Bay' },
            edges: [{ type: 'part-of', to: 'model:folder-merge' }],
          },
          {
            id: 'component:y:0000',
            semanticType: 'structural.y-component',
            edges: [{ type: 'part-of', to: 'folder:bay' }],
          },
          {
            id: 'component:y:0001',
            semanticType: 'structural.y-component',
            edges: [{ type: 'part-of', to: 'model:folder-merge' }],
          },
        ],
      },
      30,
    );
    expect(session.explorerTree.some((n) => n.id === 'folder:bay' && n.kind === 'folder')).toBe(
      true,
    );
    expect(session.explorerTree.find((n) => n.id === 'component:y:0000')?.parentId).toBe(
      'folder:bay',
    );

    const mesh = (id: string) => ({
      representationId: `repr:${id}`,
      semanticOwner: id,
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ] as const,
      indices: [0, 1, 2],
    });
    session = appApplyLiveDisplayMeshes(
      session,
      [mesh('component:y:0000'), mesh('component:y:0001'), mesh('component:y:0002')],
      40,
      2300,
    );
    expect(session.explorerTree.some((n) => n.id === 'folder:bay')).toBe(true);
    expect(session.explorerTree.find((n) => n.id === 'component:y:0000')?.parentId).toBe(
      'folder:bay',
    );
    expect(appExplorerIds(session)).toEqual([
      'component:y:0000',
      'component:y:0001',
      'component:y:0002',
    ]);

    // Graph object refresh keeps folder after API round-trip.
    session = appSetExplorerGraphObjects(session, [
      {
        id: 'folder:bay',
        semanticType: 'ui.folder',
        tags: ['ui.folder'],
        attributes: { label: 'Bay' },
        edges: [{ type: 'part-of', to: 'model:folder-merge' }],
      },
      {
        id: 'component:y:0000',
        semanticType: 'structural.y-component',
        edges: [{ type: 'part-of', to: 'folder:bay' }],
      },
      {
        id: 'component:y:0001',
        semanticType: 'structural.y-component',
        edges: [{ type: 'part-of', to: 'folder:bay' }],
      },
      {
        id: 'component:y:0002',
        semanticType: 'structural.y-component',
        edges: [{ type: 'part-of', to: 'model:folder-merge' }],
      },
    ]);
    expect(explorerChildren(session.explorerTree, 'folder:bay').map((n) => n.id)).toEqual([
      'component:y:0000',
      'component:y:0001',
    ]);
  });
});
