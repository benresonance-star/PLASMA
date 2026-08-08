import { describe, expect, it } from 'vitest';
import { runScriptedAgentWithLiveCompile } from './live-compile.js';

describe('RC-05 live AI compile adapter', () => {
  it('replaces final jobs with live compile hashes', async () => {
    const result = await runScriptedAgentWithLiveCompile(async () => ({
      ok: true,
      pirHash: 'pir:live',
      pipelineHash: 'pipe:live',
      issueCount: 0,
    }));
    expect(result.compileJob.status).toBe('succeeded');
    expect((result.compileJob.result as { pirHash: string }).pirHash).toBe('pir:live');
    expect(result.liveCompile.pipelineHash).toBe('pipe:live');
    expect(result.repair.status).toBe('succeeded');
  });
});
