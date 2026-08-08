import {
  OperatorRegistry,
  createMockTopologyOperator,
  type OperatorResult,
} from '@spds/operator-core';
import { TOLERANCE_POLICY_VERSION } from '@spds/shared-units';
import { randomUUID } from 'node:crypto';
import { PatternRegistry } from './registry.js';
import { computeInvalidationSet, planRecompilation } from '@spds/dependency-graph';

export interface CompileResult {
  readonly deterministic: true;
  readonly patternInstanceId: string;
  readonly operatorResult: OperatorResult<{ cellCount: number; junctionCount: number }>;
  readonly jobPlan: ReturnType<typeof planRecompilation>;
  readonly invalidationSet: readonly string[];
}

/** Gate: mock operators compile a semantic pattern graph deterministically. */
export async function compileMockPatternGraph(input: {
  frequency: number;
  diameterMm: number;
}): Promise<CompileResult> {
  const patterns = new PatternRegistry();
  patterns.register({
    id: 'pattern:goldberg-cellular-topology',
    version: '1.0.0',
    name: 'Goldberg Cellular Topology',
    lifecycle: 'published',
    intent: ['create cellular organisation'],
    applicableTo: ['dome'],
    operatorBindings: [
      {
        role: 'topology',
        operatorId: 'topology.goldberg.mock',
        operatorVersion: '1.0.0',
      },
    ],
  });

  const operators = new OperatorRegistry();
  operators.register(createMockTopologyOperator());
  const instance = patterns.instantiate(
    'pattern:goldberg-cellular-topology',
    '1.0.0',
    `pattern-instance:${randomUUID()}`,
  );

  const op = operators.get<
    { frequency: number; diameterMm: number },
    { cellCount: number; junctionCount: number }
  >('topology.goldberg.mock', '1.0.0');

  const operatorResult = await op.execute(input, {
    correlationId: randomUUID(),
    tolerancePolicyVersion: TOLERANCE_POLICY_VERSION,
  });

  const invalidationSet = computeInvalidationSet(
    [
      { from: 'param:frequency', to: 'topology:cells' },
      { from: 'topology:cells', to: 'repr:topology' },
    ],
    ['param:frequency'],
  );
  const jobPlan = planRecompilation(
    invalidationSet,
    new Map([['topology:cells', 'topology.goldberg.mock@1.0.0']]),
  );

  return {
    deterministic: true,
    patternInstanceId: instance.instanceId,
    operatorResult,
    jobPlan,
    invalidationSet,
  };
}
