import { describe, expect, it } from 'vitest';
import { resolveAgentMode, runAgent } from './agent-runner.js';
import type { LlmConfig } from './llm-config.js';

const baseConfig = (configured: boolean): LlmConfig => ({
  baseUrl: 'https://example.test/v1',
  apiKey: configured ? 'test-key' : null,
  model: 'test-model',
  timeoutMs: 5_000,
  configured,
});

describe('resolveAgentMode', () => {
  it('auto falls back to scripted without key', () => {
    expect(resolveAgentMode('auto', false)).toEqual({ mode: 'scripted' });
  });
  it('auto uses llm when configured', () => {
    expect(resolveAgentMode('auto', true)).toEqual({ mode: 'llm' });
  });
  it('llm without key errors', () => {
    const r = resolveAgentMode('llm', false);
    expect(r.mode).toBe('llm');
    expect(r.error).toMatch(/SPDS_AI_API_KEY/);
  });
});

describe('runAgent', () => {
  it('auto without key runs scripted and truth-gates on live compile', async () => {
    const result = await runAgent({
      mode: 'auto',
      intent: 'shorten member',
      config: baseConfig(false),
      compile: async () => ({
        ok: true,
        pirHash: 'pir:t',
        pipelineHash: 'pipe:t',
      }),
    });
    expect(result.mode).toBe('scripted');
    expect(result.status).toBe('succeeded');
    expect(result.audit.intent).toBe('shorten member');
    expect(result.llmConfigured).toBe(false);
  });

  it('scripted smoke compile receives repaired lengthMm (K4.1)', async () => {
    let seen: number | undefined;
    const result = await runAgent({
      mode: 'scripted',
      config: baseConfig(false),
      compile: async (opts) => {
        seen = opts?.lengthMm;
        return {
          ok: true,
          pirHash: 'pir:len',
          pipelineHash: 'pipe:len',
          compileHash: 'c'.repeat(64),
          parameters: { lengthMm: opts?.lengthMm ?? 0 },
        };
      },
    });
    expect(result.status).toBe('succeeded');
    expect(seen).toBe(2000);
    expect(result.liveCompile.parameters?.lengthMm).toBe(2000);
  });

  it('fails status when live compile fails even if scripted repair succeeded', async () => {
    const result = await runAgent({
      mode: 'scripted',
      config: baseConfig(false),
      compile: async () => ({ ok: false, failureCode: 'D01_FAILED' }),
    });
    expect(result.status).toBe('failed');
    expect(result.liveCompile.ok).toBe(false);
    expect(result.error).toBe('D01_FAILED');
  });

  it('llm mode without key fails clearly', async () => {
    const result = await runAgent({
      mode: 'llm',
      config: baseConfig(false),
      compile: async () => ({ ok: true }),
    });
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/not configured/);
  });

  it('llm mode proposes ChangeSet via tool calls (mocked fetch)', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'propose_changeset',
                      arguments: JSON.stringify({
                        changeSetId: 'cs:llm:test',
                        targetId: 'y:demo:01',
                        op: 'update',
                        payload: { lengthMm: 2300 },
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const result = await runAgent({
      mode: 'llm',
      intent: 'set length to 2300mm',
      config: baseConfig(true),
      fetchImpl,
      compile: async () => ({
        ok: true,
        pirHash: 'pir:llm',
        pipelineHash: 'pipe:llm',
      }),
    });
    expect(result.mode).toBe('llm');
    expect(result.status).toBe('succeeded');
    expect(result.applied.changeSetId).toBe('cs:llm:test');
    expect(result.applied.commands[0]?.targetId).toBe('y:demo:01');
    expect(result.compareJob.result).toMatchObject({ changedIds: ['y:demo:01'] });
  });

  it('rejects fabricationReady via tool router in llm loop', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_bad',
                    type: 'function',
                    function: {
                      name: 'propose_changeset',
                      arguments: JSON.stringify({
                        changeSetId: 'cs:bad',
                        targetId: 'y:demo:01',
                        op: 'update',
                        payload: { fabricationReady: true },
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const result = await runAgent({
      mode: 'llm',
      config: baseConfig(true),
      fetchImpl,
      maxLlmRounds: 1,
      compile: async () => ({ ok: true, pirHash: 'p', pipelineHash: 'q' }),
    });
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/ChangeSet|fabrication|propose/i);
  });

  it('T0b: scripted stamps live branchBinding head onto proposed ChangeSet', async () => {
    const result = await runAgent({
      mode: 'scripted',
      config: baseConfig(false),
      branchBinding: {
        modelId: 'model:live',
        branchId: 'branch:model:live:ai-agent',
        sourceBranchId: 'branch:model:live:main',
        expectedHeadHash: 'head:live-abc',
        transactionId: 'txn:live-1',
      },
      compile: async () => ({
        ok: true,
        pirHash: 'pir:t',
        pipelineHash: 'pipe:t',
      }),
    });
    expect(result.status).toBe('succeeded');
    expect(result.applied.expectedHeadHash).toBe('head:live-abc');
    expect(result.applied.branchId).toBe('branch:model:live:ai-agent');
    expect(result.applied.transactionId).toBe('txn:live-1');
    expect(result.agentContext?.world.frame.upAxis).toBe('+Z');
    expect(result.agentContext?.expectedHeadHash).toBe('head:live-abc');
    expect(result.systemPromptHash).toMatch(/^fnv1a:/);
  });

  it('T0b/TC: llm propose uses live head from branchBinding (not head:1)', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'propose_changeset',
                      arguments: JSON.stringify({
                        changeSetId: 'cs:llm:live',
                        targetId: 'y:demo:01',
                        op: 'update',
                        payload: { lengthMm: 2100 },
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const result = await runAgent({
      mode: 'llm',
      config: baseConfig(true),
      fetchImpl,
      branchBinding: {
        modelId: 'model:live',
        branchId: 'branch:ai-live',
        sourceBranchId: 'branch:main-live',
        expectedHeadHash: 'head:from-store',
        transactionId: 'txn:from-store',
      },
      compile: async () => ({ ok: true, pirHash: 'pir', pipelineHash: 'pipe' }),
    });
    expect(result.status).toBe('succeeded');
    expect(result.applied.expectedHeadHash).toBe('head:from-store');
    expect(result.applied.expectedHeadHash).not.toBe('head:1');
    expect(result.agentContext?.world.units.length).toBe('mm');
  });
});
