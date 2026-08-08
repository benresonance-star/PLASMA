import type { EffectiveState } from '@spds/composition-core';
import { parseSelector, resolveSelector, type SelectableObject } from '@spds/selectors';
import { sha256Canonical } from '@spds/reproducibility';
import { parsePirDocument, type PirDocument } from './schema.js';

export interface CompilePirInput {
  readonly effective: EffectiveState;
  readonly patternInstanceId: string;
  readonly selectableUniverse: readonly SelectableObject[];
}

function readParams(effective: EffectiveState): {
  frequency: number;
  diameterMm: number;
  skin?: string;
} {
  const params = effective.objects['params'];
  if (!params || typeof params !== 'object') {
    throw new Error('Effective state missing params object');
  }
  const p = params as Record<string, unknown>;
  const frequency = Number(p['frequency']);
  const diameterMm = Number(p['diameterMm']);
  if (!Number.isInteger(frequency) || frequency < 1) throw new Error('invalid frequency');
  if (!(diameterMm > 0)) throw new Error('invalid diameterMm');
  const skin = typeof p['skin'] === 'string' ? p['skin'] : undefined;
  return skin !== undefined ? { frequency, diameterMm, skin } : { frequency, diameterMm };
}

/** Mock compiler: resolved composition → kernel-neutral PIR (no OCCT). */
export function compilePirFromEffectiveState(input: CompilePirInput): {
  readonly pir: PirDocument;
  readonly pirHash: string;
  readonly resolvedSelectors: Readonly<Record<string, readonly string[]>>;
} {
  const params = readParams(input.effective);

  const topologySelector = parseSelector({
    id: 'selector:topology-owner',
    kind: 'Selector',
    semanticType: 'selection.semantic-query',
    where: {
      semanticType: 'structural.topology-root',
      tags: ['primary'],
    },
  });
  const topologyResolution = resolveSelector(topologySelector, input.selectableUniverse);
  if (topologyResolution.status !== 'ok') {
    throw topologyResolution.error;
  }

  const cellSelector = parseSelector({
    id: 'selector:capability-cells',
    kind: 'Selector',
    semanticType: 'selection.capability',
    capability: 'emit.cells',
  });
  const cellResolution = resolveSelector(cellSelector, input.selectableUniverse);
  if (cellResolution.status !== 'ok') {
    throw cellResolution.error;
  }

  const owner = topologyResolution.matches[0]!;
  const pir = parsePirDocument({
    schemaVersion: 'pir/1',
    id: `pir:${input.effective.compositionId}`,
    operations: [
      {
        id: 'pir:topology.goldberg',
        op: 'generate-topology',
        operator: 'topology.goldberg.class-i@1.0.0',

        semanticOwner: owner,
        inputs: {
          frequency: { value: params.frequency },
          diameterMm: { value: params.diameterMm },
          ...(params.skin !== undefined ? { skin: { value: params.skin } } : {}),
        },
        produces: { role: 'topology:cells' },
        provenance: {
          patternInstance: input.patternInstanceId,
          compositionHash: input.effective.effectiveHash,
          ...(input.effective.variantSelection
            ? {
                variantSelection: {
                  variantSetId: input.effective.variantSelection.variantSetId,
                  selectedVariantIds: [...input.effective.variantSelection.selectedVariantIds],
                },
              }
            : {}),
        },
        dependsOn: [],
      },
      {
        id: 'pir:cells.bind',
        op: 'bind-capability',
        operator: 'semantic.bind@1.0.0',
        semanticOwner: cellResolution.matches[0]!,
        inputs: {
          topology: { pirRef: 'pir:topology.goldberg' },
          targets: { selector: 'selector:capability-cells' },
        },
        produces: { role: 'topology:bound' },
        provenance: {
          patternInstance: input.patternInstanceId,
          compositionHash: input.effective.effectiveHash,
        },
        dependsOn: ['pir:topology.goldberg'],
      },
      {
        id: 'pir:y-network',
        op: 'extract-y-network',
        operator: 'topology.y-network@1.0.0',
        semanticOwner: owner,
        inputs: {
          topology: { pirRef: 'pir:topology.goldberg' },
          diameterMm: { value: params.diameterMm },
        },
        produces: { role: 'network:y' },
        provenance: {
          patternInstance: input.patternInstanceId,
          compositionHash: input.effective.effectiveHash,
        },
        dependsOn: ['pir:cells.bind'],
      },
    ],
  });

  return {
    pir,
    pirHash: sha256Canonical(pir),
    resolvedSelectors: {
      [topologySelector.id]: topologyResolution.matches,
      [cellSelector.id]: cellResolution.matches,
    },
  };
}

export function hashPir(pir: PirDocument): string {
  return sha256Canonical(pir);
}
