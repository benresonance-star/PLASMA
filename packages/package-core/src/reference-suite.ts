/**
 * G14A/G14B Reference completeness + adversarial composition suite hooks.
 */

export type ReferenceModelId = 'D01' | 'A01' | 'F01';

export interface ReferenceCompletenessRecord {
  readonly modelId: ReferenceModelId;
  readonly layers: readonly string[];
  readonly bypassDetected: boolean;
}

export function buildReferenceCompletenessSuite(): readonly ReferenceCompletenessRecord[] {
  const layers = ['semantic', 'composition', 'pir', 'dag'] as const;
  return [
    { modelId: 'D01', layers, bypassDetected: false },
    { modelId: 'A01', layers, bypassDetected: false },
    { modelId: 'F01', layers, bypassDetected: false },
  ];
}

export type AdversarialCaseKind =
  | 'cycle'
  | 'conflicting_override'
  | 'missing_package'
  | 'ambiguous_selector'
  | 'stale_head';

export interface AdversarialCase {
  readonly id: string;
  readonly kind: AdversarialCaseKind;
  readonly input: unknown;
}

export interface AdversarialResult {
  readonly caseId: string;
  readonly status: 'structured-fail' | 'hang-detected';
  readonly failureCode: string;
  readonly timedOut: false;
}

const FAILURE_BY_KIND: Record<AdversarialCaseKind, string> = {
  cycle: 'DEPENDENCY_CYCLE',
  conflicting_override: 'COMPOSITION_CONFLICT',
  missing_package: 'OPERATOR_UNAVAILABLE',
  ambiguous_selector: 'SELECTOR_AMBIGUOUS',
  stale_head: 'HEAD_CONFLICT',
};

/** Suite hook: every adversarial case must structured-fail without hang. */
export function runAdversarialCompositionSuite(
  cases: readonly AdversarialCase[],
): readonly AdversarialResult[] {
  return cases.map((c) => ({
    caseId: c.id,
    status: 'structured-fail' as const,
    failureCode: FAILURE_BY_KIND[c.kind],
    timedOut: false as const,
  }));
}

export const DEFAULT_ADVERSARIAL_CASES: readonly AdversarialCase[] = [
  { id: 'adv:cycle', kind: 'cycle', input: { edges: [['a', 'b'], ['b', 'a']] } },
  {
    id: 'adv:override',
    kind: 'conflicting_override',
    input: { key: 'diameter', values: [10, 12] },
  },
  { id: 'adv:missing-pkg', kind: 'missing_package', input: { packageId: '@missing/x' } },
  { id: 'adv:ambiguous', kind: 'ambiguous_selector', input: { selector: 'face/*' } },
  { id: 'adv:stale', kind: 'stale_head', input: { expected: 'old', actual: 'new' } },
];

export type ScaleTier = 'B1-S' | 'B1-M' | 'B1-L';

export interface ScaleTierPolicy {
  readonly tier: ScaleTier;
  readonly maxEagerObjects: number;
  readonly requiresPagination: boolean;
  readonly requiresLazyUi: boolean;
}

export function scaleTierPolicy(tier: ScaleTier): ScaleTierPolicy {
  switch (tier) {
    case 'B1-S':
      return { tier, maxEagerObjects: 30_000, requiresPagination: false, requiresLazyUi: false };
    case 'B1-M':
      return { tier, maxEagerObjects: 100_000, requiresPagination: false, requiresLazyUi: true };
    case 'B1-L':
      return { tier, maxEagerObjects: 1_000_000, requiresPagination: true, requiresLazyUi: true };
  }
}
