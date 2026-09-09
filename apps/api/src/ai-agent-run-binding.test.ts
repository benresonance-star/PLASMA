import { describe, expect, it } from 'vitest';
import { InMemoryVersionStore } from '@spds/version-core';
import { buildServer } from './server.js';
import { ensureAiBranchContext } from './ai-changeset-accept.js';
import { PARAM_D01_LENGTH_ID } from './ai-branch-seed.js';

describe('POST /ai/agent/run T0b live head binding', () => {
  it('returns ChangeSet expectedHeadHash matching AI branch head + agentContext', async () => {
    const store = new InMemoryVersionStore();
    const { app } = buildServer(store);
    const ctx = await ensureAiBranchContext(store);
    const aiHead = store.getBranchHead(ctx.aiBranchId).headHash;

    const res = await app.inject({
      method: 'POST',
      url: '/ai/agent/run',
      payload: { mode: 'scripted', intent: 'adjust length' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      status: string;
      applied: { expectedHeadHash: string; branchId: string };
      agentContext?: {
        world: { units: { length: string }; frame: { upAxis: string } };
        expectedHeadHash: string;
      };
      systemPromptHash?: string;
    };
    expect(body.status).toBe('succeeded');
    expect(body.applied.branchId).toBe(ctx.aiBranchId);
    expect(body.applied.expectedHeadHash).toBe(aiHead);
    expect(body.agentContext?.expectedHeadHash).toBe(aiHead);
    expect(body.agentContext?.world.units.length).toBe('mm');
    expect(body.agentContext?.world.frame.upAxis).toBe('+Z');
    expect(body.systemPromptHash).toMatch(/^fnv1a:/);
    expect(store.getObject(ctx.aiBranchId, PARAM_D01_LENGTH_ID)).toBeTruthy();
  });
});
