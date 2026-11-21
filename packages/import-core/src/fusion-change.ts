import { composeFirstFusion, type FusionBinding } from './fusion.js';

export interface FusionParameterLink {
  readonly loftAssemblyId: string;
  readonly loftInstanceId: string;
  readonly loftPartId: string;
  readonly loftParameter: string;
}
export interface FusionChangeInput {
  readonly buildProject: unknown;
  readonly loftProject: unknown;
  readonly bindings: readonly FusionBinding[];
  readonly expectedSourceHashes: { readonly build: string; readonly loft: string };
  readonly buildParameterId: string;
  readonly nextValue: number;
  readonly loftLink?: FusionParameterLink;
}

export interface FusionChangePreview {
  readonly status: 'proposed-only';
  readonly authority: 'plasma-semantic-graph';
  readonly committed: false;
  readonly geometryCompiled: false;
  readonly sourceHashes: { readonly build: string; readonly loft: string };
  readonly parameter: {
    readonly id: string;
    readonly before: number;
    readonly after: number;
    readonly unit: string;
  };
  readonly loftParameter?: {
    readonly partId: string;
    readonly parameter: string;
    readonly before: number;
    readonly after: number;
  };
  readonly impactedBuildEntities: readonly string[];
  readonly impactedLoftOccurrences: readonly string[];
  readonly unresolved: readonly string[];
}
function obj(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('Invalid source record');
  return v as Record<string, unknown>;
}

/**
 * FUSION-02: design-change proposal only. No cross-app mutation or commit.
 * The explicit link is mandatory before a Build parameter can drive a Loft
 * parameter, even when names and numerical values happen to agree.
 */
export function proposeFirstFusionChange(input: FusionChangeInput): FusionChangePreview {
  const preview = composeFirstFusion({
    buildProject: input.buildProject,
    loftProject: input.loftProject,
    bindings: input.bindings,
  });
  const buildHash = preview.sources.find((s) => s.system === 'build')?.sourceHash;
  const loftHash = preview.sources.find((s) => s.system === 'loft')?.sourceHash;
  if (!buildHash || !loftHash ||
      buildHash !== input.expectedSourceHashes.build ||
      loftHash !== input.expectedSourceHashes.loft) {
    throw new Error('FUSION_SOURCE_STALE: source revision changed; preview again');
  }
  const parameter = preview.parameters.find((p) => p.id === input.buildParameterId);
  if (!parameter) throw new Error('FUSION_PARAMETER_UNKNOWN');
  if (parameter.role === 'derived' || parameter.role === 'presentation-only'
      || !parameter.editableBy.includes('user')) {
    throw new Error('FUSION_PARAMETER_NOT_USER_EDITABLE');
  }
  if (typeof input.nextValue !== 'number' || !Number.isFinite(input.nextValue)) {
    throw new Error('FUSION_PARAMETER_NONFINITE');
  }
  if (parameter.domain?.min !== undefined && input.nextValue < parameter.domain.min ||
      parameter.domain?.max !== undefined && input.nextValue > parameter.domain.max) {
    throw new Error('FUSION_PARAMETER_OUT_OF_DOMAIN');
  }
  if (parameter.quantity.value === input.nextValue) throw new Error('FUSION_PARAMETER_UNCHANGED');
  const affected = [...new Set(parameter.affects)].sort();
  const impactedOccurrences = new Set<string>();
  let loftParameter: FusionChangePreview['loftParameter'];
  if (input.loftLink) {
    if (parameter.quantity.unit !== 'mm') throw new Error('FUSION_LINK_UNIT_UNSUPPORTED');
    const link = input.loftLink;
    const record = preview.bindings.find((b) => {
      const occurrence = preview.objects.find((o) => o.id === b.loftOccurrenceId);
      return affected.includes(b.buildEntityId) &&
        occurrence?.metadata?.['sourceAssemblyId'] === link.loftAssemblyId &&
        occurrence?.metadata?.['sourceInstanceId'] === link.loftInstanceId;
    });
    if (!record) throw new Error('FUSION_LINK_NOT_BOUND_TO_AFFECTED_ENTITY');
    const occurrence = preview.objects.find((o) => o.id === record.loftOccurrenceId);
    if (occurrence?.metadata?.['sourcePartId'] !== link.loftPartId) {
      throw new Error('FUSION_LINK_PART_MISMATCH');
    }
    const part = preview.objects.find((o) =>
      o.semanticType === 'geometry.loft.part' &&
      o.metadata?.['sourcePartId'] === link.loftPartId);
    const values = obj(part?.metadata?.['rawParameters']);
    const old = values[link.loftParameter];
    if (typeof old !== 'number' || !Number.isFinite(old)) {
      throw new Error('FUSION_LINK_PARAMETER_NOT_NUMERIC');
    }
    if (Math.abs(old - parameter.quantity.value) > 1e-6) {
      throw new Error('FUSION_LINK_BASE_VALUES_DIFFER: use an explicitly reconciled baseline');
    }
    loftParameter = {
      partId: link.loftPartId, parameter: link.loftParameter,
      before: old, after: input.nextValue,
    };
    // Part definitions may be instanced multiple times: all occurrences must be reviewed.
    for (const o of preview.objects) {
      if (o.semanticType === 'geometry.loft.occurrence' &&
          o.metadata?.['sourcePartId'] === link.loftPartId) {
        impactedOccurrences.add(o.id);
      }
    }
  } else {
    for (const binding of preview.bindings) {
      if (affected.includes(binding.buildEntityId)) {
        impactedOccurrences.add(binding.loftOccurrenceId);
      }
    }
  }
  return {
    status: 'proposed-only',
    authority: 'plasma-semantic-graph',
    committed: false,
    geometryCompiled: false,
    sourceHashes: { build: buildHash, loft: loftHash },
    parameter: {
      id: parameter.id, before: parameter.quantity.value,
      after: input.nextValue, unit: parameter.quantity.unit,
    },
    ...(loftParameter === undefined ? {} : { loftParameter }),
    impactedBuildEntities: affected,
    impactedLoftOccurrences: [...impactedOccurrences].sort(),
    unresolved: [
      'Proposed value has not been committed through Plasma transaction authority',
      'Loft exact B-rep regeneration and geometric topology have not been evaluated',
      'Build hosting rules, drawings, quantities and engineering checks remain unvalidated',
    ],
  };
}
