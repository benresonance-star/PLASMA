import { describe, expect, it } from 'vitest';
import { FAILURE_CODES, createSpdsError, isFailureCode } from './index.js';

describe('@spds/failure-taxonomy', () => {
  it('recognizes all documented codes', () => {
    expect(FAILURE_CODES.length).toBeGreaterThanOrEqual(20);
    expect(isFailureCode('HEAD_CONFLICT')).toBe(true);
    expect(isFailureCode('NOT_A_CODE')).toBe(false);
  });

  it('creates structured errors', () => {
    const err = createSpdsError({
      code: 'PUBLICATION_BLOCKED',
      summary: 'Geometry validation failed',
      affectedSemanticIds: ['component:y:0042'],
      recoverable: true,
      suggestedNextActions: ['Inspect validation diagnostics'],
    });
    expect(err.code).toBe('PUBLICATION_BLOCKED');
    expect(err.affectedSemanticIds).toEqual(['component:y:0042']);
  });

  it('rejects empty summaries', () => {
    expect(() =>
      createSpdsError({
        code: 'CANCELLED',
        summary: '   ',
        affectedSemanticIds: [],
        recoverable: true,
      }),
    ).toThrow(/summary/i);
  });
});
