import { createHash } from 'node:crypto';
import { createSpdsError } from '@spds/failure-taxonomy';

/** G10B Import + semanticisation contracts — no false native-parametric claims. */

export interface ImportedAsset {
  readonly assetId: string;
  readonly sourceFormat: 'STEP';
  readonly sourceHash: string;
  readonly units: 'mm' | 'm' | 'inch' | 'ambiguous';
  readonly frameId: string | null;
  readonly solidCount: number;
  /** Never claim native parametric history for imports. */
  readonly parametricClaim: 'reference-only';
}

export interface ImportedShape {
  readonly shapeId: string;
  readonly assetId: string;
  readonly solidIndex: number;
  readonly displayReady: boolean;
}

export interface SemanticAssertion {
  readonly assertionId: string;
  readonly shapeId: string;
  readonly assertedType?: string;
  readonly material?: string;
  readonly role?: string;
  readonly actor: 'user' | 'ai';
}

export interface SemanticisationSession {
  readonly sessionId: string;
  readonly assetId: string;
  readonly assertions: readonly SemanticAssertion[];
  readonly status: 'open' | 'committed' | 'aborted';
}

export function hashSourceBytes(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function detectStepUnits(headerText: string): ImportedAsset['units'] {
  const lower = headerText.toLowerCase();
  // STEP often uses SI_UNIT(.MILLI.,.METRE.) for millimetres.
  const hasMm =
    /\.milli\.\s*,\s*\.metr[e]?\./.test(lower) ||
    /conversion_based_unit\s*\(\s*'millimetre'/i.test(headerText) ||
    /milli\s*metr[e]?/.test(lower) ||
    /\bmm\b/.test(lower);
  const hasInch =
    /\.inch\./.test(lower) ||
    /conversion_based_unit\s*\(\s*'inch'/i.test(headerText) ||
    /\binch\b/.test(lower);
  const hasM =
    !hasMm &&
    (/\.metr[e]?\./.test(lower) ||
      /si_unit\s*\(\s*\*\s*,\s*\.metr[e]?\./.test(lower) ||
      /\bmetr[e]?\b/.test(lower));
  const hits = [hasMm, hasInch, hasM].filter(Boolean).length;
  if (hits === 0 || hits > 1) return 'ambiguous';
  if (hasMm) return 'mm';
  if (hasInch) return 'inch';
  return 'm';
}

/** Count solids from STEP text entities — no OCCT required. */
export function countStepSolids(stepText: string): number {
  const patterns = [
    /MANIFOLD_SOLID_BREP\s*\(/gi,
    /CLOSED_SHELL\s*\(/gi,
    /ADVANCED_BREP_SHAPE_REPRESENTATION\s*\(/gi,
  ];
  let max = 0;
  for (const re of patterns) {
    const matches = stepText.match(re);
    if (matches) max = Math.max(max, matches.length);
  }
  return max;
}

export function createImportedAsset(input: {
  readonly sourceBytes: string;
  readonly headerText: string;
  readonly solidCount?: number;
  readonly frameId?: string;
}): ImportedAsset {
  const units = detectStepUnits(input.headerText);
  if (units === 'ambiguous') {
    throw createSpdsError({
      code: 'IMPORT_UNIT_AMBIGUOUS',
      summary: 'STEP file units are ambiguous or missing',
      affectedSemanticIds: [],
      recoverable: true,
    });
  }
  const parsedSolids = countStepSolids(input.sourceBytes);
  const solidCount = Math.max(input.solidCount ?? 0, parsedSolids);
  if (solidCount < 1) {
    throw createSpdsError({
      code: 'SEMANTIC_INVALID',
      summary: 'STEP import produced no solids',
      affectedSemanticIds: [],
      recoverable: false,
    });
  }
  const sourceHash = hashSourceBytes(input.sourceBytes);
  return {
    assetId: `import:${sourceHash.slice(0, 12)}`,
    sourceFormat: 'STEP',
    sourceHash,
    units,
    frameId: input.frameId ?? null,
    solidCount,
    parametricClaim: 'reference-only',
  };
}

export function shapesFromAsset(asset: ImportedAsset): ImportedShape[] {
  return Array.from({ length: asset.solidCount }, (_, solidIndex) => ({
    shapeId: `${asset.assetId}/solid:${solidIndex}`,
    assetId: asset.assetId,
    solidIndex,
    displayReady: true,
  }));
}

export function openSemanticisationSession(assetId: string): SemanticisationSession {
  return {
    sessionId: `semsess:${assetId}`,
    assetId,
    assertions: [],
    status: 'open',
  };
}

export function addAssertion(
  session: SemanticisationSession,
  assertion: Omit<SemanticAssertion, 'assertionId'> & { readonly assertionId?: string },
): SemanticisationSession {
  if (session.status !== 'open') {
    throw new Error('Semanticisation session is not open');
  }
  const next: SemanticAssertion = {
    assertionId: assertion.assertionId ?? `assert:${session.assertions.length + 1}`,
    shapeId: assertion.shapeId,
    actor: assertion.actor,
    ...(assertion.assertedType !== undefined ? { assertedType: assertion.assertedType } : {}),
    ...(assertion.material !== undefined ? { material: assertion.material } : {}),
    ...(assertion.role !== undefined ? { role: assertion.role } : {}),
  };
  return { ...session, assertions: [...session.assertions, next] };
}

export function placeImportedInAssembly(input: {
  readonly asset: ImportedAsset;
  readonly instanceId: string;
  readonly frameId: string;
}): {
  readonly instanceId: string;
  readonly assetId: string;
  readonly frameId: string;
  readonly parametricClaim: 'reference-only';
} {
  return {
    instanceId: input.instanceId,
    assetId: input.asset.assetId,
    frameId: input.frameId,
    parametricClaim: 'reference-only',
  };
}
