import { describe, expect, it } from 'vitest';
import {
  applyChangeSet,
  buildAiChangesView,
  buildFeedbackPacket,
  createRepairSession,
  executeReadTool,
  impactPreview,
  recordAiAudit,
  runRepairAttempt,
  validateChangeSet,
  whatIfTool,
  whyTool,
  type ChangeSet,
} from './index.js';

describe('G13 AI interface', () => {
  const catalog = {
    objects: [{ id: 'Y:1', kind: 'Y' }],
    patterns: ['geodesic'],
    operators: ['subdivide'],
    schemaTypes: ['Y', 'Edge'],
  };

  it('provides read-only tools without SQL mutation surface', () => {
    const result = executeReadTool({ tool: 'search', query: 'Y' }, catalog);
    expect(result.readOnly).toBe(true);
    expect((result.data as { id: string }[])[0]?.id).toBe('Y:1');
  });

  it('validates ChangeSets inside transactions with head checks', () => {
    const cs: ChangeSet = {
      changeSetId: 'cs:1',
      branchId: 'branch:ai',
      expectedHeadHash: 'head:1',
      transactionId: 'txn:1',
      commands: [{ op: 'update', targetId: 'Y:1', payload: { param: 2 } }],
      actor: 'ai',
      disposition: 'proposed',
    };
    expect(validateChangeSet(cs).ok).toBe(true);
    expect(impactPreview(cs).targetIds).toContain('Y:1');
    expect(
      applyChangeSet({
        changeSet: cs,
        currentHeadHash: 'head:1',
        agentBranchId: 'branch:ai',
        sourceBranchId: 'branch:main',
      }).disposition,
    ).toBe('applied');
    expect(
      applyChangeSet({
        changeSet: cs,
        currentHeadHash: 'stale',
        agentBranchId: 'branch:ai',
        sourceBranchId: 'branch:main',
      }).disposition,
    ).toBe('conflict');
    expect(
      validateChangeSet({
        ...cs,
        commands: [{ op: 'update', targetId: 'Y:1', payload: { fabricationReady: true } }],
      }).ok,
    ).toBe(false);
    expect(buildAiChangesView([cs])[0]?.attribution).toBe('ai');
  });
});

describe('G13A closed-loop repair', () => {
  it('bounds repair attempts and audits lineage without relaxing hard constraints', () => {
    let session = createRepairSession('repair:1', 3);
    const mkCs = (id: string): ChangeSet => ({
      changeSetId: id,
      branchId: 'branch:ai',
      expectedHeadHash: 'h',
      transactionId: 'txn:1',
      commands: [{ op: 'update', targetId: 'Y:1', payload: { param: 1 } }],
      actor: 'ai',
      disposition: 'proposed',
    });

    for (let i = 0; i < 3; i++) {
      session = runRepairAttempt({
        session,
        changeSet: mkCs(`cs:${i}`),
        currentHeadHash: 'h',
        agentBranchId: 'branch:ai',
        sourceBranchId: 'branch:main',
        feedback: buildFeedbackPacket({
          attempt: i + 1,
          failures:
            i < 2
              ? [{ code: 'CONSTRAINT_FAILED', summary: 'too short', lineage: ['Y:1'] }]
              : [],
          constraintResults: i < 2 ? [{ id: 'c1', ok: false }] : [{ id: 'c1', ok: true }],
        }),
      });
    }
    expect(session.status).toBe('succeeded');
    expect(session.attempts).toHaveLength(3);

    expect(() =>
      runRepairAttempt({
        session: createRepairSession('r2', 3),
        changeSet: mkCs('cs:x'),
        currentHeadHash: 'h',
        agentBranchId: 'branch:ai',
        sourceBranchId: 'branch:main',
        feedback: buildFeedbackPacket({ attempt: 1 }),
        relaxHardConstraints: true,
      }),
    ).toThrow(/hard constraints/);

    expect(whyTool('Y:1', ['pattern:geo', 'op:y']).lineage).toHaveLength(2);
    expect(whatIfTool({ branchId: 'tmp', deltas: { mass: 1 }, compiled: false }).fidelity).toBe(
      'estimated',
    );
    const audit = recordAiAudit({
      auditId: 'audit:1',
      intent: 'fix length',
      toolCalls: ['lookup', 'mutate'],
      changeSetIds: session.attempts.map((a) => a.changeSet.changeSetId),
      repairAttempts: session.attempts.length,
      disposition: session.status,
    });
    expect(audit.actor).toBe('ai');
  });
});
