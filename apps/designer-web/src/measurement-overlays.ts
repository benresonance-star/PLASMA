/** G8.5 Measurement overlays — bind to semantic anchors, not triangle indices. */

export interface SemanticAnchor {
  readonly path: string;
  readonly semanticId: string;
  readonly position: readonly [number, number, number];
}

export interface MeasurementResult {
  readonly quantity: number;
  readonly unit: 'mm' | 'deg';
  readonly kind: 'distance' | 'angle';
  readonly anchorA: string;
  readonly anchorB: string;
}

export interface MeasurementOverlay {
  readonly id: string;
  readonly result: MeasurementResult;
  readonly fromSemantic: boolean;
}

export function distanceMm(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dy, dz);
}

/** Vertex-to-vertex (semantic anchor) measure tool. */
export function measureDistance(a: SemanticAnchor, b: SemanticAnchor): MeasurementResult {
  return {
    quantity: distanceMm(a.position, b.position),
    unit: 'mm',
    kind: 'distance',
    anchorA: a.path,
    anchorB: b.path,
  };
}

export function overlayFromSemanticDimension(input: {
  readonly id: string;
  readonly quantity: number;
  readonly unit: 'mm' | 'deg';
  readonly kind: 'distance' | 'angle';
  readonly anchorPathA: string;
  readonly anchorPathB: string;
}): MeasurementOverlay {
  return {
    id: input.id,
    fromSemantic: true,
    result: {
      quantity: input.quantity,
      unit: input.unit,
      kind: input.kind,
      anchorA: input.anchorPathA,
      anchorB: input.anchorPathB,
    },
  };
}

export function assertSemanticAnchors(overlay: MeasurementOverlay): void {
  if (!overlay.result.anchorA.startsWith('semantic:') || !overlay.result.anchorB.startsWith('semantic:')) {
    throw new Error('Measurement overlays must bind to semantic: paths, not triangle indices');
  }
}
