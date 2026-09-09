import { describe, expect, it } from 'vitest';
import { parsePatternDefinition } from '@spds/pattern-engine';
import { buildAgentContextPackage } from './agent-context.js';
import { agentParametersFromPattern } from './pattern-parameters.js';

describe('package-derived agent parameters', () => {
  it('replaces the model-specific fallback catalog', () => {
    const pattern = parsePatternDefinition({
      id: 'pattern:test',
      version: '1.0.0',
      name: 'Test',
      parameters: [
        {
          name: 'frequency',
          semanticId: 'param:test:frequency',
          path: 'params.frequency',
          type: 'integer',
          unit: '1',
          default: 2,
          min: 1,
          max: 8,
          aliases: ['param:legacy:frequency'],
        },
      ],
    });
    const parameters = agentParametersFromPattern(pattern, { 'params.frequency': 3 });
    const context = buildAgentContextPackage({
      modelId: 'model:test',
      branchId: 'branch:test',
      expectedHeadHash: 'head:test',
      transactionId: 'txn:test',
      parameters,
    });

    expect(context.mutate.parameters).toHaveLength(1);
    expect(context.mutate.parameters[0]).toMatchObject({
      id: 'param:test:frequency',
      path: 'params.frequency',
      quantity: { value: 3, unit: '1' },
      domain: { min: 1, max: 8 },
    });
    expect(context.mutate.parameters[0]?.targetAliases).toContain('param:legacy:frequency');
  });
});
