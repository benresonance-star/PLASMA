import { describe, expect, it } from 'vitest';
import {
  buildValidationReport,
  issuesForSemantic,
  objectUiStateFromIssues,
} from './index.js';

describe('validation-core', () => {
  it('maps severities to UI states and filters by semantic id', () => {
    const report = buildValidationReport({
      modelId: 'm',
      branchId: 'b',
      issues: [
        {
          id: 'i1',
          code: 'CONSTRAINT_FAILED',
          severity: 'fail',
          summary: 'edge too short',
          affectedSemanticIds: ['Y:1'],
          stage: 'fabrication',
        },
        {
          id: 'i2',
          code: 'GEOMETRY_TOLERANCE_EXCEEDED',
          severity: 'warn',
          summary: 'loose tol',
          affectedSemanticIds: ['Y:2'],
        },
      ],
    });
    expect(objectUiStateFromIssues(report.issues)).toBe('fail');
    expect(objectUiStateFromIssues([], { preview: true })).toBe('preview');
    expect(issuesForSemantic(report, 'Y:1')).toHaveLength(1);
  });
});
