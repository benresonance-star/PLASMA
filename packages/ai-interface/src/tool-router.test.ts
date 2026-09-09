import { describe, expect, it } from 'vitest';
import { buildAgentContextPackage } from './agent-context.js';
import { AI_TOOL_DEFINITIONS, routeAiTool } from './tool-router.js';

const agentContext = buildAgentContextPackage({
  modelId: 'model:1',
  branchId: 'branch:ai-agent',
  expectedHeadHash: 'head:1',
  transactionId: 'txn:1',
});

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
  agentContext,
  acceptOps: agentContext.mutate.acceptOps,
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
        payload: { lengthMm: 2300 },
      }),
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.changeSet?.disposition).toBe('applied');
    expect(r.changeSet?.branchId).toBe('branch:ai-agent');
  });

  it('proposes create_group organise ChangeSet without mutating catalog', () => {
    const r = routeAiTool(
      'propose_changeset',
      JSON.stringify({
        changeSetId: 'cs:org',
        op: 'create_group',
        payload: { label: 'Bay', parentId: 'model:d01' },
      }),
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.changeSet?.commands[0]?.op).toBe('create_group');
    expect(r.changeSet?.disposition).toBe('applied');
    expect(ctx.catalog.objects).toHaveLength(1);
  });

  it('exposes schema_catalog, lookup, and get_context in definitions and router', () => {
    const names = AI_TOOL_DEFINITIONS.map((d) => d.function.name);
    expect(names).toContain('schema_catalog');
    expect(names).toContain('lookup');
    expect(names).toContain('get_context');
    const propose = AI_TOOL_DEFINITIONS.find((d) => d.function.name === 'propose_changeset');
    const opEnum = (propose?.function.parameters as { properties?: { op?: { enum?: string[] } } })
      ?.properties?.op?.enum;
    expect(opEnum).toEqual(['update', 'create', 'create_group', 'connect', 'apply_pattern']);
    expect(opEnum).not.toContain('delete');
    const t0 = performance.now();
    const catalog = routeAiTool('schema_catalog', '{}', ctx);
    expect(performance.now() - t0).toBeLessThan(5);
    expect(catalog.ok).toBe(true);
    expect(catalog.data).toEqual(['Y']);
    const looked = routeAiTool('lookup', JSON.stringify({ semanticId: 'y:demo:01' }), ctx);
    expect(looked.ok).toBe(true);
    expect(looked.data).toMatchObject({ id: 'y:demo:01' });
    const context = routeAiTool('get_context', '{}', ctx);
    expect(context.ok).toBe(true);
    expect(context.data).toMatchObject({
      world: { units: { length: 'mm' }, frame: { upAxis: '+Z' } },
    });
  });

  it('rejects propose ops outside acceptOps', () => {
    const r = routeAiTool(
      'propose_changeset',
      JSON.stringify({
        changeSetId: 'cs:delete',
        targetId: 'y:demo:01',
        op: 'delete',
        payload: {},
      }),
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/UNSUPPORTED_OP:delete/);
  });
});
