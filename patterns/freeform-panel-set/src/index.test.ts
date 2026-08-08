import { describe, expect, it } from 'vitest';
import { FREEFORM_PATTERN_ID, loadFreeformPanelPatternManifest } from './index.js';

describe('E11 freeform panel pattern package', () => {
  it('loads non-dome pattern without dome applicableTo exclusivity', () => {
    const pattern = loadFreeformPanelPatternManifest();
    expect(pattern.id).toBe(FREEFORM_PATTERN_ID);
    expect(pattern.applicableTo).toContain('freeform-surface');
    expect(pattern.applicableTo).not.toContain('dome');
    expect(pattern.lifecycle).toBe('published');
  });
});
