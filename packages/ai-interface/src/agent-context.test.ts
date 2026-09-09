import { describe, expect, it } from 'vitest';
import {
  AGENT_VIEWPORT_UP_NOTE,
  AGENT_WORLD_LENGTH_UNIT,
  AGENT_WORLD_UP_AXIS,
  DEFAULT_ACCEPT_OPS,
  assertAcceptOpsSubset,
  buildAgentContextPackage,
  renderAgentSystemPrompt,
} from './agent-context.js';
import { LENGTH_MM_MAX, LENGTH_MM_MIN } from './changeset-accept.js';

describe('AgentContextPackage (TC)', () => {
  it('includes mm, +Z WORLD, viewport Y-up note, and agent-editable length domain', () => {
    const ctx = buildAgentContextPackage({
      modelId: 'model:1',
      branchId: 'branch:ai',
      expectedHeadHash: 'head:live',
      transactionId: 'txn:1',
    });
    expect(ctx.world.units.length).toBe(AGENT_WORLD_LENGTH_UNIT);
    expect(ctx.world.frame.upAxis).toBe(AGENT_WORLD_UP_AXIS);
    expect(ctx.world.viewportNote).toBe(AGENT_VIEWPORT_UP_NOTE);
    expect(ctx.expectedHeadHash).toBe('head:live');
    const p = ctx.mutate.parameters[0]!;
    expect(p.quantity.unit).toBe('mm');
    expect(p.domain.min).toBe(LENGTH_MM_MIN);
    expect(p.domain.max).toBe(LENGTH_MM_MAX);
    expect(p.editableBy).toContain('agent');
    expect(ctx.mutate.acceptOps).toEqual([...DEFAULT_ACCEPT_OPS]);
    expect(ctx.discover.kinds.length).toBeGreaterThan(0);
    expect(ctx.promptHash).toMatch(/^fnv1a:/);
  });

  it('system prompt contains units, up axis, dual-frame note, and example ChangeSet', () => {
    const ctx = buildAgentContextPackage({
      modelId: 'model:1',
      branchId: 'branch:ai',
      expectedHeadHash: 'abc',
      transactionId: 'txn:1',
    });
    const prompt = renderAgentSystemPrompt(ctx);
    expect(prompt).toContain('mm');
    expect(prompt).toContain('+Z');
    expect(prompt).toContain('Y-up');
    expect(prompt).toContain('expectedHeadHash=abc');
    expect(prompt).toContain('lengthMm');
    expect(prompt).toContain('"op":"update"');
  });

  it('acceptOps must be subset of lowerer-supported ops', () => {
    expect(assertAcceptOpsSubset(DEFAULT_ACCEPT_OPS, DEFAULT_ACCEPT_OPS).ok).toBe(true);
    expect(assertAcceptOpsSubset(['delete'], DEFAULT_ACCEPT_OPS).ok).toBe(false);
    expect(assertAcceptOpsSubset(['create', 'apply_pattern'], DEFAULT_ACCEPT_OPS).ok).toBe(true);
  });

  it('discover may list kinds beyond mutate allowlist', () => {
    const ctx = buildAgentContextPackage({
      modelId: 'model:1',
      branchId: 'branch:ai',
      expectedHeadHash: 'h',
      transactionId: 't',
      catalog: {
        schemaTypes: ['Parameter', 'Pattern', 'Affector', 'Constraint'],
        patterns: ['pattern:goldberg-cellular-topology@1.0.0'],
        operators: ['y-network.v1'],
      },
    });
    expect(ctx.discover.kinds).toContain('Affector');
    expect(ctx.mutate.kindsAllowlist).not.toContain('Affector');
  });
});
