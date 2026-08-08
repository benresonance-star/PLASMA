import { describe, expect, it } from 'vitest';
import { assessSection30AEvidence, SECTION_30A_EVIDENCE } from './evidence-matrix.js';

describe('E6 §30A evidence matrix', () => {
  it('covers criteria 34–56 with no blocked rows', () => {
    expect(SECTION_30A_EVIDENCE).toHaveLength(23);
    const assessment = assessSection30AEvidence();
    expect(assessment.ids).toEqual(Array.from({ length: 23 }, (_, i) => i + 34));
    expect(assessment.blocked).toBe(0);
    expect(assessment.met).toBe(23);
    expect(assessment.partial).toBe(0);
  });
});
