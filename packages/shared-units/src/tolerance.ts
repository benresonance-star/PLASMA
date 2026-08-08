/**
 * Documented tolerance policy (spec section 31).
 * Never scatter unexplained epsilon constants elsewhere — import from here.
 */

export const TOLERANCE_POLICY_VERSION = '1.0.0' as const;

export interface TolerancePolicy {
  readonly version: typeof TOLERANCE_POLICY_VERSION;
  /** Modelling length tolerance (mm). */
  readonly modellingLengthMm: number;
  /** Angular tolerance (radians). */
  readonly angularRad: number;
  /** Coincidence tolerance (mm). */
  readonly coincidenceMm: number;
  /** Tessellation chordal deviation (mm). */
  readonly tessellationChordMm: number;
  /** Tessellation angular tolerance (radians). */
  readonly tessellationAngularRad: number;
  /** Family clustering length tolerance (mm) — separate from geometry validity. */
  readonly familyClusteringLengthMm: number;
  /** Family clustering angular tolerance (radians). */
  readonly familyClusteringAngularRad: number;
}

export const DEFAULT_TOLERANCE_POLICY: TolerancePolicy = {
  version: TOLERANCE_POLICY_VERSION,
  modellingLengthMm: 1e-3,
  angularRad: 1e-6,
  coincidenceMm: 1e-3,
  tessellationChordMm: 0.5,
  tessellationAngularRad: 0.15,
  familyClusteringLengthMm: 3,
  familyClusteringAngularRad: 0.01,
};

export function assertNamedTolerance(policy: TolerancePolicy): void {
  for (const [key, value] of Object.entries(policy)) {
    if (key === 'version') continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`Tolerance policy field "${key}" must be a non-negative finite number`);
    }
  }
}
