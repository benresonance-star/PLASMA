import { describe, expect, it } from 'vitest';
import { runCompileValidateCompare, runScriptedAgentFixture } from './agent-fixture.js';

describe('G13/G13A scripted agent fixture', () => {
  it('proposes on isolated branch, fails validate, repairs within bound, audits lineage', () => {
    const result = runScriptedAgentFixture();
    expect(result.readSummary.objectCount).toBeGreaterThan(0);
    expect(result.applied.disposition).toBe('applied');
    expect(result.applied.branchId).toBe('branch:ai-agent');
    expect(result.compileJob.status).toBe('succeeded');
    expect(result.validateJob.status).toBe('succeeded');
    expect(result.compareJob.status).toBe('succeeded');
    expect(result.repair.status).toBe('succeeded');
    expect(result.repair.attempts.length).toBe(2);
    expect(result.audit.repairAttempts).toBe(2);
    expect(result.audit.disposition).toBe('applied');
    expect(result.why.lineage.length).toBeGreaterThan(0);
    expect(result.changesView.every((c) => c.attribution === 'ai')).toBe(true);
  });

  it('exposes compile/validate/compare job runners', () => {
    const jobs = runCompileValidateCompare({ compileOk: false, validateOk: true });
    expect(jobs.compileJob.status).toBe('failed');
    expect(jobs.validateJob.status).toBe('succeeded');
  });
});
