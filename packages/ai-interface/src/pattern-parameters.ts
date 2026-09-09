import type { PatternDefinition, PatternParameterDefinition } from '@spds/pattern-engine';
import type { AgentContextParameter } from './agent-context.js';

function numericValue(
  parameter: PatternParameterDefinition,
  values: Readonly<Record<string, unknown>>,
): number | undefined {
  const value = values[parameter.path] ?? values[parameter.name] ?? parameter.default;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Convert package-owned numeric parameter contracts into agent discovery metadata.
 * Non-numeric controls remain discoverable through the pattern catalog until
 * AgentContext gains typed boolean/string/enum mutation payloads.
 */
export function agentParametersFromPattern(
  pattern: PatternDefinition,
  values: Readonly<Record<string, unknown>> = {},
): readonly AgentContextParameter[] {
  return pattern.parameters.flatMap((parameter) => {
    if (parameter.type !== 'number' && parameter.type !== 'integer') return [];
    const value = numericValue(parameter, values);
    if (value === undefined || parameter.min === undefined || parameter.max === undefined) {
      return [];
    }
    return [
      {
        id: parameter.semanticId,
        path: parameter.path,
        quantity: { value, unit: parameter.unit },
        domain: { min: parameter.min, max: parameter.max },
        role: parameter.role,
        editableBy: [...parameter.editableBy],
        targetAliases: [parameter.semanticId, parameter.path, parameter.name, ...parameter.aliases],
      },
    ];
  });
}
