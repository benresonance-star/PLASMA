import { sha256Canonical } from '@spds/reproducibility';
import type { Operator, OperatorContext, OperatorResult } from './types.js';

export interface TopologyMockInput {
  readonly frequency: number;
  readonly diameterMm: number;
}

export interface TopologyMockOutput {
  readonly cellCount: number;
  readonly junctionCount: number;
}

export function createMockTopologyOperator(): Operator<TopologyMockInput, TopologyMockOutput> {
  return {
    id: 'topology.goldberg.mock',
    version: '1.0.0',
    deterministic: true,
    validateInput(input) {
      if (!Number.isInteger(input.frequency) || input.frequency < 1) {
        throw new Error('frequency must be positive integer');
      }
      if (!(input.diameterMm > 0)) throw new Error('diameterMm must be positive');
    },
    async execute(input, context: OperatorContext): Promise<OperatorResult<TopologyMockOutput>> {
      this.validateInput(input);
      const cellCount = 10 * input.frequency * input.frequency + 2;
      const junctionCount = cellCount * 2;
      const output = { cellCount, junctionCount };
      return {
        output,
        inputsHash: sha256Canonical(input),
        outputHash: sha256Canonical(output),
        operatorVersion: this.version,
        warnings: [],
        numericalTolerances: {},
        provenance: {
          correlationId: context.correlationId,
          tolerancePolicyVersion: context.tolerancePolicyVersion,
        },
      };
    },
  };
}
