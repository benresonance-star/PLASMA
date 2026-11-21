import { composeFirstFusion } from './fusion.js';
import { proposeFirstFusionChange, type FusionChangeInput, type FusionParameterLink } from './fusion-change.js';

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(path + ': expected source object');
  }
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(path + ': expected source array');
  return value;
}

export interface FusionRevisionInput extends FusionChangeInput {
  readonly loftLink: FusionParameterLink;
}
export interface FusionDerivedRevision {
  readonly stage: 'F09';
  readonly kind: 'source-revision-proposal';
  readonly originalSources: { readonly build: string; readonly loft: string };
  readonly revisedSources: { readonly build: string; readonly loft: string };
  readonly changedParameterId: string;
  readonly sourceIdentityPreserved: true;
  readonly affectedBuildEntities: readonly string[];
  readonly affectedLoftOccurrences: readonly string[];
  readonly buildProject: unknown;
  readonly loftProject: unknown;
  readonly publicationReady: false;
}

/** Reconcile, validate and derive one atomic source revision without modifying
 * either input. The native Plasma VersionStore must commit the resulting
 * source bundle in one optimistic-concurrency mutation; this helper never
 * writes or publishes a BIM document.
 */
export function deriveFusionSourceRevision(input: FusionRevisionInput): FusionDerivedRevision {
  const proposal = proposeFirstFusionChange(input);
  if (!proposal.loftParameter) throw new Error('FUSION_REVISION_EXPLICIT_LOFT_LINK_REQUIRED');
  const original = composeFirstFusion(input);
  const nextBuild: unknown = structuredClone(input.buildProject);
  const nextLoft: unknown = structuredClone(input.loftProject);
  const graph = record(record(nextBuild, 'buildProject')['authoritativeGraph'], 'Build.graph');
  const parameters = array(graph['parameters'], 'Build.parameters').map((p) => record(p, 'Build.parameter'));
  const parameter = parameters.find((p) => p['id'] === input.buildParameterId);
  if (!parameter) throw new Error('FUSION_REVISION_PARAMETER_MISSING');
  const quantity = record(parameter['quantity'], 'Build.parameter.quantity');
  quantity['value'] = input.nextValue;

  const loft = record(nextLoft, 'loftProject');
  const part = array(loft['parts'], 'Loft.parts').map((p) => record(p, 'Loft.part'))
    .find((p) => p['id'] === input.loftLink.loftPartId);
  if (!part) throw new Error('FUSION_REVISION_LOFT_PART_MISSING');
  const values = record(part['parameters'], 'Loft.parameters');
  if (typeof values[input.loftLink.loftParameter] !== 'number') {
    throw new Error('FUSION_REVISION_LOFT_PARAMETER_MISSING');
  }
  values[input.loftLink.loftParameter] = input.nextValue;
  const next = composeFirstFusion({
    buildProject: nextBuild, loftProject: nextLoft, bindings: input.bindings,
  });
  if (JSON.stringify(original.bindings) !== JSON.stringify(next.bindings) ||
      JSON.stringify(original.objects.map(o => o.id)) !== JSON.stringify(next.objects.map(o => o.id))) {
    throw new Error('FUSION_REVISION_UNEXPECTED_IDENTITY_CHANGE');
  }
  const getHash = (which: 'build' | 'loft') => {
    const source = next.sources.find((s) => s.system === which);
    if (!source) throw new Error('FUSION_REVISION_SOURCE_MISSING');
    return source.sourceHash;
  };
  if (getHash('build') === input.expectedSourceHashes.build ||
      getHash('loft') === input.expectedSourceHashes.loft) {
    throw new Error('FUSION_REVISION_SOURCE_HASH_NOT_CHANGED');
  }
  return {
    stage: 'F09',
    kind: 'source-revision-proposal',
    originalSources: { ...input.expectedSourceHashes },
    revisedSources: { build: getHash('build'), loft: getHash('loft') },
    changedParameterId: input.buildParameterId,
    sourceIdentityPreserved: true,
    affectedBuildEntities: proposal.impactedBuildEntities,
    affectedLoftOccurrences: proposal.impactedLoftOccurrences,
    buildProject: nextBuild,
    loftProject: nextLoft,
    publicationReady: false,
  };
}
