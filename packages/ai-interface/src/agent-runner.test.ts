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
                        payload: { lengthMm: 9 },
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
      intent: 'set length to 9mm',
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
});
