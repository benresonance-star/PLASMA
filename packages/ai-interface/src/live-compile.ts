/**
 * RC-05 — wire AI compile/validate jobs to a real compile function (e.g. D01 pipeline).
 */

import {
  enqueueJob,
  runScriptedAgentFixture,
  type AgentFixtureResult,
} from './agent-fixture.js';
import type { AiJob } from './tools.js';

export interface LiveCompileResult {
  readonly ok: boolean;
  readonly pirHash?: string;
  readonly pipelineHash?: string;
  readonly issueCount?: number;
  readonly failureCode?: string;
}

export async function runCompileValidateCompareLive(input: {
  readonly compile: () => Promise<LiveCompileResult>;
  readonly validate?: () => Promise<LiveCompileResult>;
}): Promise<{ readonly compileJob: AiJob; readonly validateJob: AiJob; readonly compareJob: AiJob }> {
  const compiled = await input.compile();
  const validated = input.validate
    ? await input.validate()
    : { ok: compiled.ok, issueCount: compiled.ok ? 0 : 1 };
  return {
    compileJob: enqueueJob('compile', compiled.ok, {
      pirHash: compiled.pirHash,
      pipelineHash: compiled.pipelineHash,
      failureCode: compiled.failureCode,
    }),
    validateJob: enqueueJob('validate', validated.ok, {
      issueCount: validated.issueCount ?? (validated.ok ? 0 : 1),
    }),
    compareJob: enqueueJob('compare', true, { changedIds: ['Y:1'] }),
  };
}

/** Scripted agent fixture with final jobs replaced by live compile results. */
export async function runScriptedAgentWithLiveCompile(
  compile: () => Promise<LiveCompileResult>,
): Promise<AgentFixtureResult & { readonly liveCompile: LiveCompileResult }> {
  const base = runScriptedAgentFixture();
  const live = await compile();
  const jobs = await runCompileValidateCompareLive({
    compile: async () => live,
    validate: async () => {
      const result: LiveCompileResult = {
        ok: live.ok,
        issueCount: live.ok ? 0 : 1,
        ...(live.failureCode !== undefined ? { failureCode: live.failureCode } : {}),
      };
      return result;
    },
  });
  return {
    ...base,
    compileJob: jobs.compileJob,
    validateJob: jobs.validateJob,
    compareJob: jobs.compareJob,
    liveCompile: live,
  };
}
