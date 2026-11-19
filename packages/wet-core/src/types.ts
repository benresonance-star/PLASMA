/** Wet-core benchmark v0.3: semantic source of truth, never a rendered mesh. Units: mm. */
export type Point3 = readonly [number, number, number];
export type WetMedium = 'cold-water' | 'hot-water' | 'sanitary' | 'vent';
export type AssemblyKind =
  | 'water-meter' | 'water-heater' | 'manifold' | 'sanitary-stack'
  | 'basin' | 'shower' | 'wc' | 'laundry-trough' | 'trap';
export type PortRole = 'supply' | 'receive' | 'branch' | 'discharge';
export interface WetPort {
  readonly id: string;
  readonly ownerId: string;
  readonly medium: WetMedium;
  readonly role: PortRole;
  readonly nominalDiameterMm: number;
  readonly positionMm: Point3;
  readonly connection: 'press' | 'solvent' | 'threaded';
}
export interface WetComponent {
  readonly id: string;
  readonly kind: AssemblyKind;
  readonly name: string;
  readonly manufacturer: 'generic-unverified';
  readonly originMm: Point3;
  readonly sizeMm: Point3;
  readonly portIds: readonly string[];
  /** Directed, explicit functional connections inside a component. */
  readonly internalLinks: readonly (readonly [string, string])[];
}
export interface WetFitting {
  readonly id: string;
  readonly runId: string;
  readonly kind: 'press-elbow-90' | 'dwv-bend-unverified' | 'trap' | 'wye-branch';
  readonly positionMm: Point3;
  readonly nominalDiameterMm: number;
  readonly catalogStatus: 'generic' | 'requires-product-matching';
}
export interface WetRun {
  readonly id: string;
  readonly medium: WetMedium;
  readonly fromPortId: string;
  readonly toPortId: string;
  readonly nominalDiameterMm: number;
  readonly material: 'copper-press' | 'pvc-dwv';
  readonly pointsMm: readonly Point3[];
  readonly fittingIds: readonly string[];
}
export interface StructuralMember {
  readonly id: string;
  readonly kind: 'slab' | 'joist' | 'stud' | 'plate' | 'lining' | 'chase-boundary';
  readonly minMm: Point3;
  readonly maxMm: Point3;
  readonly structural: boolean;
}
export interface WetCoreModel {
  readonly id: 'TH-01-WET-CORE';
  readonly revision: 'v0.3';
  readonly parameters: { readonly basinShiftMm: number; readonly storeyHeightMm: 3000 };
  readonly dimensionsMm: Point3;
  readonly components: readonly WetComponent[];
  readonly ports: readonly WetPort[];
  readonly runs: readonly WetRun[];
  readonly fittings: readonly WetFitting[];
  readonly structure: readonly StructuralMember[];
  readonly assumptions: readonly string[];
  readonly committed: false;
}
export type IssueCode =
  | 'DUPLICATE_ID' | 'DANGLING_PORT' | 'MEDIA_MISMATCH' | 'ENDPOINT_MISMATCH'
  | 'NOMINAL_DIAMETER_MISMATCH' | 'DISCONNECTED_SUPPLY' | 'DISCONNECTED_DRAIN'
  | 'UNSUPPORTED_GRADIENT' | 'STRUCTURAL_INTERFERENCE' | 'UNVERIFIED_FITTING'
  | 'NEEDS_ENGINEERING_REVIEW';
export interface WetIssue {
  readonly code: IssueCode;
  readonly severity: 'error' | 'review';
  readonly ownerId: string;
  readonly relatedIds: readonly string[];
  readonly detail: string;
}
export interface WetAssessment {
  readonly modelId: string;
  readonly checkedRunCount: number;
  readonly connectedFixtureCount: number;
  readonly issues: readonly WetIssue[];
  readonly materialLengthMm: Readonly<Record<'copper-press' | 'pvc-dwv', number>>;
  readonly fittingCount: number;
  readonly engineeringStatus: 'not-verified';
  readonly committed: false;
}
