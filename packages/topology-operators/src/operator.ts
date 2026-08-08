import { sha256Canonical } from '@spds/reproducibility';
import { TOLERANCE_POLICY_VERSION } from '@spds/shared-units';
import type { Operator, OperatorContext, OperatorResult } from '@spds/operator-core';
import { generateGoldbergTopology, hashTopology } from './d01.js';
import type { GoldbergTopology } from './goldberg.js';

export interface GoldbergOperatorInput {
  readonly frequency: number;
  readonly riseRatio: number;
  readonly diameterMm: number;
}

export function createGoldbergTopologyOperator(): Operator<
  GoldbergOperatorInput,
  GoldbergTopology
> {
  return {
    id: 'topology.goldberg.class-i',
    version: '1.0.0',
    deterministic: true,
    validateInput(input) {
      if (!Number.isInteger(input.frequency) || input.frequency < 1) {
        throw new Error('frequency must be positive integer');
      }
      if (!(input.riseRatio >= 0 && input.riseRatio <= 1)) {
        throw new Error('riseRatio must be in [0,1]');
      }
      if (!(input.diameterMm > 0)) throw new Error('diameterMm must be positive');
    },
    async execute(
      input,
      context: OperatorContext,
    ): Promise<OperatorResult<GoldbergTopology>> {
      this.validateInput(input);
      const output = generateGoldbergTopology({
        frequency: input.frequency,
        riseRatio: input.riseRatio,
      });
      return {
        output,
        inputsHash: sha256Canonical(input),
        outputHash: hashTopology(output),
        operatorVersion: this.version,
        warnings: [],
        numericalTolerances: { sphere: 1e-12 },
        provenance: {
          correlationId: context.correlationId,
          tolerancePolicyVersion: context.tolerancePolicyVersion ?? TOLERANCE_POLICY_VERSION,
        },
      };
    },
  };
}
