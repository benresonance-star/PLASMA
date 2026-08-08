import { createSpdsError } from '@spds/failure-taxonomy';
import { sha256Canonical } from '@spds/reproducibility';
import {
  COMPOSITION_LAYER_ORDER,
  type CompositionDocument,
  type ParameterOverride,
} from './types.js';

export interface EffectiveState {
  readonly compositionId: string;
  readonly publishedBaseId: string;
  readonly objects: Readonly<Record<string, unknown>>;
  readonly appliedOverrides: readonly ParameterOverride[];
  readonly variantSelection?: {
    readonly variantSetId: string;
    readonly selectedVariantIds: readonly string[];
  };
  readonly effectiveHash: string;
}

function applyOverride(
  objects: Record<string, unknown>,
  override: ParameterOverride,
): void {
  const parts = override.path.split('.');
  let cursor: Record<string, unknown> = objects;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const next = cursor[key];
    if (next === undefined || typeof next !== 'object' || next === null || Array.isArray(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = override.value;
}

function cloneObjects(objects: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return structuredClone(objects) as Record<string, unknown>;
}

/**
 * Resolve layered composition + variants into an immutable effective state.
 * Published bases are never mutated; overrides are delta-applied onto a clone.
 */
export function resolveEffectiveState(doc: CompositionDocument): EffectiveState {
  if (!doc.publishedBaseImmutable) {
    throw createSpdsError({
      code: 'COMPOSITION_CONFLICT',
      summary: 'Published bases must be immutable',
      affectedSemanticIds: [doc.id, doc.publishedBaseId],
      recoverable: false,
    });
  }

  const ordered = [...doc.layers].sort(
    (a, b) =>
      COMPOSITION_LAYER_ORDER.indexOf(a.layer) - COMPOSITION_LAYER_ORDER.indexOf(b.layer),
  );

  const objects = cloneObjects(doc.objects);
  const applied: ParameterOverride[] = [];

  for (const layer of ordered) {
    for (const override of layer.overrides) {
      applyOverride(objects, override);
      applied.push(override);
    }
  }

  let variantSelection: EffectiveState['variantSelection'];
  if (doc.variantSelection) {
    if (!doc.variantSet || doc.variantSet.id !== doc.variantSelection.variantSetId) {
      throw createSpdsError({
        code: 'COMPOSITION_CONFLICT',
        summary: 'Variant selection references missing or mismatched variant set',
        affectedSemanticIds: [doc.id, doc.variantSelection.variantSetId],
        recoverable: true,
      });
    }
    const byId = new Map(doc.variantSet.variants.map((v) => [v.id, v]));
    for (const selectedId of doc.variantSelection.selectedVariantIds) {
      const variant = byId.get(selectedId);
      if (!variant) {
        throw createSpdsError({
          code: 'COMPOSITION_CONFLICT',
          summary: `Unknown variant ${selectedId}`,
          affectedSemanticIds: [doc.id, selectedId],
          recoverable: true,
        });
      }
      for (const override of variant.overrides) {
        applyOverride(objects, override);
        applied.push(override);
      }
    }
    variantSelection = {
      variantSetId: doc.variantSelection.variantSetId,
      selectedVariantIds: [...doc.variantSelection.selectedVariantIds].sort(),
    };
  }

  const payload = {
    compositionId: doc.id,
    publishedBaseId: doc.publishedBaseId,
    objects,
    appliedOverrides: applied,
    ...(variantSelection !== undefined ? { variantSelection } : {}),
  };

  return {
    ...payload,
    effectiveHash: sha256Canonical(payload),
  };
}

/** Semantic compare of two effective states (variant alternatives). */
export function compareEffectiveStates(a: EffectiveState, b: EffectiveState): {
  readonly equal: boolean;
  readonly hashA: string;
  readonly hashB: string;
  readonly differingPaths: readonly string[];
} {
  const differingPaths: string[] = [];
  const keys = new Set([...Object.keys(a.objects), ...Object.keys(b.objects)]);
  for (const key of [...keys].sort()) {
    if (sha256Canonical(a.objects[key]) !== sha256Canonical(b.objects[key])) {
      differingPaths.push(key);
    }
  }
  return {
    equal: a.effectiveHash === b.effectiveHash,
    hashA: a.effectiveHash,
    hashB: b.effectiveHash,
    differingPaths,
  };
}
