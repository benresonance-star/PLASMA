import {
  parseCompositionDocument,
  resolveEffectiveState,
  type CompositionDocument,
} from '@spds/composition-core';
import { compilePirFromEffectiveState } from '@spds/parametric-ir';
import type { SelectableObject } from '@spds/selectors';
import { buildExecutionDag, runMockDag, type ExecutionDag } from './dag.js';

export interface G3aFixtureResult {
  readonly effectiveHash: string;
  readonly pirHash: string;
  readonly dagHash: string;
  readonly dag: ExecutionDag;
  readonly variantSelection?: {
    readonly variantSetId: string;
    readonly selectedVariantIds: readonly string[];
  };
}

export function buildG3aCompositionFixture(): CompositionDocument {
  return parseCompositionDocument({
    id: 'composition:g3a-fixture',
    publishedBaseId: 'pattern:goldberg-cellular-topology@1.0.0',
    publishedBaseImmutable: true,
    layers: [
      { layer: 'base', overrides: [{ path: 'params.frequency', value: 2 }] },
      { layer: 'specialisation', overrides: [{ path: 'params.diameterMm', value: 20000 }] },
      { layer: 'project', overrides: [{ path: 'params.projectTag', value: 'D01' }] },
    ],
    variantSet: {
      id: 'variants:skin',
      variants: [
        {
          id: 'variant:skin-etfe',
          label: 'ETFE',
          dimension: 'material',
          overrides: [{ path: 'params.skin', value: 'ETFE' }],
        },
      ],
    },
    variantSelection: {
      variantSetId: 'variants:skin',
      selectedVariantIds: ['variant:skin-etfe'],
    },
    objects: {
      params: { frequency: 1, diameterMm: 10000 },
    },
  });
}

export const G3A_SELECTABLE_UNIVERSE: readonly SelectableObject[] = [
  {
    id: 'topology:root',
    semanticType: 'structural.topology-root',
    tags: ['primary'],
    capabilities: ['emit.cells'],
  },
  {
    id: 'cell:capability-sink',
    semanticType: 'structural.cell-set',
    capabilities: ['emit.cells'],
  },
];

/** Gate: patterns/overrides/variants → inspectable PIR + reproducible DAG. */
export function resolveG3aFixture(): G3aFixtureResult {
  const doc = buildG3aCompositionFixture();
  const effective = resolveEffectiveState(doc);
  const compiled = compilePirFromEffectiveState({
    effective,
    patternInstanceId: 'pattern-instance:g3a-fixture',
    selectableUniverse: G3A_SELECTABLE_UNIVERSE,
  });
  const dag = buildExecutionDag(compiled.pir, compiled.pirHash);
  return {
    effectiveHash: effective.effectiveHash,
    pirHash: compiled.pirHash,
    dagHash: dag.dagHash,
    dag,
    ...(effective.variantSelection !== undefined
      ? { variantSelection: effective.variantSelection }
      : {}),
  };
}

export function runG3aFixtureTwice(): {
  readonly first: G3aFixtureResult;
  readonly second: G3aFixtureResult;
  readonly cacheHitOnSecond: boolean;
} {
  const first = resolveG3aFixture();
  const cache = new Map<string, unknown>();
  runMockDag(first.dag, cache);
  const second = resolveG3aFixture();
  const rerun = runMockDag(second.dag, cache);
  const cacheHitOnSecond = rerun.nodes.every((n) => n.cacheStatus === 'hit');
  return { first, second, cacheHitOnSecond };
}
