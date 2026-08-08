import { describe, expect, it } from 'vitest';
import { routeAiTool } from './tool-router.js';

const ctx = {
  catalog: {
    objects: [{ id: 'y:demo:01', kind: 'Y' }],
    patterns: ['geodesic'],
    operators: ['y-network.v1'],
    schemaTypes: ['Y'],
  },
  agentBranchId: 'branch:ai-agent',
  sourceBranchId: 'branch:main',
  currentHeadHash: 'head:1',
  transactionId: 'txn:1',
};

describe('routeAiTool', () => {
  it('runs read-only summary', () => {
    const r = routeAiTool('summary', '{}', ctx);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ objectCount: 1 });
  });

  it('rejects fabricationReady proposals', () => {
    const r = routeAiTool(
      'propose_changeset',
      JSON.stringify({
        changeSetId: 'cs:1',
        targetId: 'y:demo:01',
        op: 'update',
        payload: { fabricationReady: true },
      }),
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/fabrication-ready/i);
  });

  it('applies a valid ChangeSet on the AI branch', () => {
    const r = routeAiTool(
      'propose_changeset',
      JSON.stringify({
        changeSetId: 'cs:ok',
        targetId: 'y:demo:01',
        op: 'update',
        payload: { lengthMm: 8 },
      }),
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.changeSet?.disposition).toBe('applied');
    expect(r.changeSet?.branchId).toBe('branch:ai-agent');
  });
});
