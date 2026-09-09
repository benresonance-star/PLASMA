import { describe, expect, it } from 'vitest';
import { ANALYSIS_COPY } from './AnalysisPanel.js';

describe('AnalysisPanel copy', () => {
  it('stays indicative and avoids certification claims', () => {
    const blob = `${ANALYSIS_COPY.indicative}`.toLowerCase();
    expect(blob).toMatch(/indicative/);
    for (const banned of ANALYSIS_COPY.forbidden) {
      expect(blob.includes(banned)).toBe(false);
    }
  });
});
