import { describe, expect, it } from 'vitest';
import { d01ParamKeyFromSemanticId, d01ParamSemanticId } from './param-selection.js';

describe('param-selection', () => {
  it('round-trips inspector keys and semantic ids', () => {
    expect(d01ParamSemanticId('lengthMm')).toBe('param:d01:lengthMm');
    expect(d01ParamSemanticId('armWidthMm')).toBe('param:d01:armWidthMm');
    expect(d01ParamSemanticId('structuralDepthMm')).toBe('param:d01:structuralDepthMm');
    expect(d01ParamKeyFromSemanticId('param:d01:armWidthMm')).toBe('armWidthMm');
    expect(d01ParamKeyFromSemanticId('component:y:0000')).toBeNull();
  });
});
