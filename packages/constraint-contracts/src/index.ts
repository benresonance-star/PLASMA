/**
 * Sketch / geometric constraint contract (spec 5B.10).
 * No production solver — adapter interface + vocabulary only.
 */

export const GEOMETRIC_CONSTRAINT_VOCABULARY = [
  'coincident',
  'horizontal',
  'vertical',
  'parallel',
  'perpendicular',
  'equal',
  'distance',
  'angle',
  'radius',
  'diameter',
  'tangent',
  'concentric',
  'symmetric',
  'fixed',
] as const;

export type GeometricConstraintKind = (typeof GEOMETRIC_CONSTRAINT_VOCABULARY)[number];

export const CONSTRAINT_SOLVER_STATES = [
  'satisfied',
  'under-constrained',
  'fully-constrained',
  'over-constrained',
  'conflicting',
  'unsupported',
] as const;

export type ConstraintSolverState = (typeof CONSTRAINT_SOLVER_STATES)[number];

export interface GeometricConstraintRequest {
  readonly id: string;
  readonly kind: GeometricConstraintKind;
  readonly targetIds: readonly string[];
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface ConstraintSolveResult {
  readonly state: ConstraintSolverState;
  readonly message?: string;
  readonly unsupportedKinds?: readonly GeometricConstraintKind[];
}

export interface ConstraintSolverAdapter {
  readonly id: string;
  readonly version: string;
  solve(requests: readonly GeometricConstraintRequest[]): Promise<ConstraintSolveResult>;
}

/** Default adapter: never claims to solve — reports unsupported. */
export class UnsupportedConstraintSolverAdapter implements ConstraintSolverAdapter {
  readonly id = 'constraint.solver.unsupported';
  readonly version = '1.0.0';

  async solve(requests: readonly GeometricConstraintRequest[]): Promise<ConstraintSolveResult> {
    return {
      state: 'unsupported',
      message: 'No production sketch solver in v1.2 — contract only',
      unsupportedKinds: requests.map((r) => r.kind),
    };
  }
}
