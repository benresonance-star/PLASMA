/**
 * Shared units / quantities and documented tolerance policy (spec section 31).
 */

export {
  DEFAULT_TOLERANCE_POLICY,
  TOLERANCE_POLICY_VERSION,
  assertNamedTolerance,
  type TolerancePolicy,
} from './tolerance.js';

export type LengthUnit = 'mm' | 'm' | 'in';

export interface Quantity {
  readonly value: number;
  readonly unit: LengthUnit;
}

const TO_MM: Record<LengthUnit, number> = {
  mm: 1,
  m: 1000,
  in: 25.4,
};

/** Canonical internal length unit for architectural fabrication (spec section 31). */
export const CANONICAL_LENGTH_UNIT: LengthUnit = 'mm';

export function quantity(value: number, unit: LengthUnit): Quantity {
  if (!Number.isFinite(value)) {
    throw new Error('Quantity value must be a finite number');
  }
  return { value, unit };
}

export function toMillimetres(q: Quantity): number {
  return q.value * TO_MM[q.unit];
}

export function convertLength(q: Quantity, to: LengthUnit): Quantity {
  const mm = toMillimetres(q);
  return quantity(mm / TO_MM[to], to);
}
