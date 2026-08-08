/** G10A.2 Dimension / PMI-ready geometric dimensions on persistent anchors. */

export interface SemanticDimension {
  readonly id: string;
  readonly kind: 'linear' | 'angular' | 'radial' | 'diameter';
  readonly value: number;
  readonly unit: 'mm' | 'deg';
  readonly anchorSelectorA: string;
  readonly anchorSelectorB: string;
  readonly tolerance?: { readonly upper: number; readonly lower: number };
}

export function createSemanticDimension(input: SemanticDimension): SemanticDimension {
  if (!input.anchorSelectorA || !input.anchorSelectorB) {
    throw new Error('Dimension anchors required');
  }
  return input;
}

export function resolveDimension(
  dim: SemanticDimension,
  resolvedSelectors: ReadonlySet<string>,
): { readonly ok: boolean; readonly reason?: string } {
  if (!resolvedSelectors.has(dim.anchorSelectorA)) {
    return { ok: false, reason: `Unresolved anchor A: ${dim.anchorSelectorA}` };
  }
  if (!resolvedSelectors.has(dim.anchorSelectorB)) {
    return { ok: false, reason: `Unresolved anchor B: ${dim.anchorSelectorB}` };
  }
  return { ok: true };
}
