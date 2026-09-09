import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('RC-01 API D01 display meshes + AI live compile', () => {
  it('returns tessellated D01 meshes for viewport', async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/references/d01/display-meshes',
      payload: { yLimit: 2 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      source: string;
      meshes: { semanticOwner: string; triangleCount: number }[];
    };
    expect(body.source).toBe('d01-reference-pipeline');
    expect(body.meshes.length).toBe(6);
    expect(body.meshes[0]!.triangleCount).toBeGreaterThan(0);
  });

  it('runs AI agent against live D01 compile (auto → scripted without key)', async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/agent/run',
      payload: { intent: 'shorten Y', mode: 'auto' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      mode: string;
      status: string;
      llmConfigured: boolean;
      compileJob: { status: string; result: { pirHash: string } };
      liveCompile: { ok: boolean };
      repair: { status: string };
      audit: { intent: string };
    };
    expect(body.mode).toBe('scripted');
    expect(body.llmConfigured).toBe(false);
    expect(body.status).toBe('succeeded');
    expect(body.compileJob.status).toBe('succeeded');
    expect(body.liveCompile.ok).toBe(true);
    expect(body.repair.status).toBe('succeeded');
    expect(body.audit.intent).toBe('shorten Y');
  });

  it('llm mode without key returns 503', async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/ai/agent/run',
      payload: { mode: 'llm', intent: 'test' },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { status: string; error?: string };
    expect(body.status).toBe('failed');
    expect(body.error).toMatch(/SPDS_AI_API_KEY/);
  });
});
