import { describe, expect, it } from 'vitest';
import { runStepImportJob } from './index.js';

describe('G10B import-worker', () => {
  it('imports STEP and reports viewport readiness', () => {
    const result = runStepImportJob({
      jobId: 'job:1',
      filename: 'part.step',
      bytes: 'ISO-10303-21;',
      headerText: 'SI_UNIT(.MILLI.,.METRE.)',
      solidCountHint: 3,
      timeoutMs: 10_000,
    });
    expect(result.status).toBe('succeeded');
    expect(result.viewportReady).toBe(true);
    expect(result.shapes).toHaveLength(3);
  });

  it('fails malformed files and ambiguous units', () => {
    expect(
      runStepImportJob({
        jobId: 'job:2',
        filename: 'bad.step',
        bytes: 'MALFORMED',
        headerText: 'SI_UNIT(.MILLI.,.METRE.)',
        solidCountHint: 1,
        timeoutMs: 1000,
      }).status,
    ).toBe('failed');
    expect(
      runStepImportJob({
        jobId: 'job:3',
        filename: 'u.step',
        bytes: 'x',
        headerText: '',
        solidCountHint: 1,
        timeoutMs: 1000,
      }).failureCode,
    ).toBe('IMPORT_UNIT_AMBIGUOUS');
  });
});
