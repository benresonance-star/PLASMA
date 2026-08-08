import { describe, expect, it } from 'vitest';
import { parseCompositionDocument } from './types.js';
import { compareEffectiveStates, resolveEffectiveState } from './resolve.js';

function baseDoc(selectionIds: string[]) {
  return parseCompositionDocument({
    id: 'composition:d01',
    publishedBaseId: 'pattern:goldberg@1.0.0',
    publishedBaseImmutable: true,
    layers: [
      {
        layer: 'base',
        overrides: [{ path: 'params.frequency', value: 2 }],
      },
      {
        layer: 'project',
        overrides: [{ path: 'params.diameterMm', value: 20000 }],
      },
    ],
    variantSet: {
      id: 'variants:skin',
      variants: [
        {
          id: 'variant:skin-a',
          label: 'Skin A',
          dimension: 'material',
          overrides: [{ path: 'params.skin', value: 'ETFE' }],
        },
        {
          id: 'variant:skin-b',
          label: 'Skin B',
          dimension: 'material',
          overrides: [{ path: 'params.skin', value: 'glass' }],
        },
      ],
    },
    variantSelection: {
      variantSetId: 'variants:skin',
      selectedVariantIds: selectionIds,
    },
    objects: {
      params: { frequency: 1, diameterMm: 10000 },
    },
  });
}

describe('G3A.2–3 composition and variants', () => {
  it('resolves deterministic effective state without mutating published base', () => {
    const doc = baseDoc(['variant:skin-a']);
    const a = resolveEffectiveState(doc);
    const b = resolveEffectiveState(doc);
    expect(a.effectiveHash).toBe(b.effectiveHash);
    expect(a.objects).toEqual({
      params: { frequency: 2, diameterMm: 20000, skin: 'ETFE' },
    });
    expect(doc.objects).toEqual({ params: { frequency: 1, diameterMm: 10000 } });
  });

  it('records variant selection in effective provenance and compares alternatives', () => {
    const a = resolveEffectiveState(baseDoc(['variant:skin-a']));
    const b = resolveEffectiveState(baseDoc(['variant:skin-b']));
    expect(a.variantSelection?.selectedVariantIds).toEqual(['variant:skin-a']);
    const cmp = compareEffectiveStates(a, b);
    expect(cmp.equal).toBe(false);
    expect(cmp.differingPaths).toContain('params');
  });
});
