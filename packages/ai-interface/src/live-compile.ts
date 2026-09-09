/**
 * RC-05 — wire AI compile/validate jobs to a real compile function (e.g. D01 pipeline).
 */

import {
  enqueueJob,
  runScriptedAgentFixture,
  type AgentFixtureResult,
} from './agent-fixture.js';
import type { AiJob } from './tools.js';
import { DEMO_Y_SEMANTIC_ID } from './id-map.js';

export interface LiveCompileResult {
  readonly ok: boolean;
  readonly pirHash?: string;
  readonly pipelineHash?: string;
  readonly compileHash?: string;
  readonly parameters?: Readonly<Record<string, number>>;
  readonly issueCount?: number;
  readonly failureCode?: string;
}

export interface LiveCompileOptions {
  readonly lengthMm?: number;
}

export type LiveCompileFn = (opts?: LiveCompileOptions) => Promise<LiveCompileResult>;

export async function runCompileValidateCompareLive(input: {
  readonly compile: LiveCompileFn;
  readonly validate?: LiveCompileFn;
  readonly changedIds?: readonly string[];
  readonly compileOpts?: LiveCompileOptions;
}): Promise<{ readonly compileJob: AiJob; readonly validateJob: AiJob; readonly compareJob: AiJob }> {
  const compiled = await input.compile(input.compileOpts);
  const validated = input.validate
    ? await input.validate(input.compileOpts)
    : { ok: compiled.ok, issueCount: compiled.ok ? 0 : 1 };
  return {
    compileJob: enqueueJob('compile', compiled.ok, {
      pirHash: compiled.pirHash,
      pipelineHash: compiled.pipelineHash,
      compileHash: compiled.compileHash,
      parameters: compiled.parameters,
      failureCode: compiled.failureCode,
    }),
    validateJob: enqueueJob('validate', validated.ok, {
      issueCount: validated.issueCount ?? (validated.ok ? 0 : 1),
    }),
    compareJob: enqueueJob('compare', true, {
      changedIds: input.changedIds ?? [DEMO_Y_SEMANTIC_ID],
    }),
  };
}

/** Scripted agent fixture with final jobs replaced by live compile results. */
export async function runScriptedAgentWithLiveCompile(
  compile: LiveCompileFn,
): Promise<AgentFixtureResult & { readonly liveCompile: LiveCompileResult }> {
  const base = runScriptedAgentFixture();
  const repaired = base.repair.attempts.at(-1)?.changeSet ?? base.applied;
  const lengthMm = extractLengthMmFromChangeSet(repaired);
  const compileOpts = lengthMm !== undefined ? { lengthMm } : undefined;
  const live = await compile(compileOpts);
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

function extractLengthMmFromChangeSet(cs: {
  readonly commands: readonly { readonly payload?: unknown }[];
}): number | undefined {
  for (const cmd of cs.commands) {
    const payload = cmd.payload;
    if (payload && typeof payload === 'object' && 'lengthMm' in payload) {
      const n = (payload as { lengthMm?: unknown }).lengthMm;
      if (typeof n === 'number' && Number.isFinite(n)) return n;
    }
  }
  return undefined;
}
