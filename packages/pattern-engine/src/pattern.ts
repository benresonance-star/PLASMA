import { z } from 'zod';

export const PATTERN_LIFECYCLE = ['draft', 'validated', 'published', 'deprecated'] as const;

export const PATTERN_PARAMETER_TYPES = ['number', 'integer', 'boolean', 'string', 'enum'] as const;

export const PatternParameterDefinitionSchema = z
  .object({
    name: z.string().min(1),
    semanticId: z.string().min(1),
    path: z.string().min(1),
    type: z.enum(PATTERN_PARAMETER_TYPES),
    unit: z.string().min(1).default('1'),
    default: z.unknown().optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    options: z.array(z.string().min(1)).optional(),
    role: z
      .enum([
        'design-variable',
        'derived',
        'constraint-limit',
        'fabrication-variable',
        'analysis-variable',
        'presentation-only',
      ])
      .default('design-variable'),
    editableBy: z.array(z.enum(['user', 'agent', 'optimizer'])).default(['user', 'agent']),
    aliases: z.array(z.string().min(1)).default([]),
    label: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    group: z.string().min(1).optional(),
  })
  .superRefine((parameter, ctx) => {
    if (
      parameter.min !== undefined &&
      parameter.max !== undefined &&
      parameter.min > parameter.max
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `Parameter ${parameter.name} min must be <= max`,
      });
    }
    if (parameter.type === 'enum' && (!parameter.options || parameter.options.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        message: `Enum parameter ${parameter.name} requires options`,
      });
    }
    if (parameter.default !== undefined) {
      const value = parameter.default;
      if (
        (parameter.type === 'number' || parameter.type === 'integer') &&
        (typeof value !== 'number' || !Number.isFinite(value))
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `Parameter ${parameter.name} default must be numeric`,
        });
      }
      if (parameter.type === 'integer' && typeof value === 'number' && !Number.isInteger(value)) {
        ctx.addIssue({
          code: 'custom',
          message: `Parameter ${parameter.name} default must be an integer`,
        });
      }
      if (
        typeof value === 'number' &&
        ((parameter.min !== undefined && value < parameter.min) ||
          (parameter.max !== undefined && value > parameter.max))
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `Parameter ${parameter.name} default is outside its domain`,
        });
      }
      if (
        parameter.type === 'enum' &&
        (typeof value !== 'string' || !parameter.options?.includes(value))
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `Parameter ${parameter.name} default must be one of its options`,
        });
      }
    }
  });

export const PatternDefinitionSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  lifecycle: z.enum(PATTERN_LIFECYCLE).default('draft'),
  intent: z.array(z.string()).default([]),
  applicableTo: z.array(z.string()).default([]),
  requires: z.array(z.string()).default([]),
  parameters: z.array(PatternParameterDefinitionSchema).default([]),
  inputs: z.array(z.unknown()).default([]),
  outputs: z.array(z.unknown()).default([]),
  constraints: z.array(z.unknown()).default([]),
  rules: z.array(z.unknown()).default([]),
  subpatterns: z.array(z.string()).default([]),
  operatorBindings: z
    .array(
      z.object({
        role: z.string(),
        operatorId: z.string(),
        operatorVersion: z.string(),
      }),
    )
    .default([]),
  parentId: z.string().optional(),
});

export type PatternDefinition = z.infer<typeof PatternDefinitionSchema>;
export type PatternParameterDefinition = z.infer<typeof PatternParameterDefinitionSchema>;

export function parsePatternDefinition(input: unknown): PatternDefinition {
  return PatternDefinitionSchema.parse(input);
}

export function resolvePatternParameters(
  pattern: PatternDefinition,
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  const resolved: Record<string, unknown> = {};
  for (const parameter of pattern.parameters) {
    const value =
      parameter.path in overrides
        ? overrides[parameter.path]
        : parameter.name in overrides
          ? overrides[parameter.name]
          : parameter.default;
    if (value === undefined) {
      throw new Error(`Missing required pattern parameter ${parameter.path}`);
    }
    const parsed = PatternParameterDefinitionSchema.parse(parameter);
    if (
      (parsed.type === 'number' || parsed.type === 'integer') &&
      (typeof value !== 'number' || !Number.isFinite(value))
    ) {
      throw new Error(`Pattern parameter ${parsed.path} must be numeric`);
    }
    if (parsed.type === 'integer' && typeof value === 'number' && !Number.isInteger(value)) {
      throw new Error(`Pattern parameter ${parsed.path} must be an integer`);
    }
    if (
      typeof value === 'number' &&
      ((parsed.min !== undefined && value < parsed.min) ||
        (parsed.max !== undefined && value > parsed.max))
    ) {
      throw new Error(`Pattern parameter ${parsed.path} is outside its domain`);
    }
    if (parsed.type === 'boolean' && typeof value !== 'boolean') {
      throw new Error(`Pattern parameter ${parsed.path} must be boolean`);
    }
    if ((parsed.type === 'string' || parsed.type === 'enum') && typeof value !== 'string') {
      throw new Error(`Pattern parameter ${parsed.path} must be a string`);
    }
    if (parsed.type === 'enum' && !parsed.options?.includes(value as string)) {
      throw new Error(`Pattern parameter ${parsed.path} must be one of its options`);
    }
    resolved[parsed.path] = value;
  }
  return resolved;
}

export function findPatternParameter(
  pattern: PatternDefinition,
  targetId: string,
): PatternParameterDefinition | undefined {
  return pattern.parameters.find(
    (parameter) =>
      parameter.semanticId === targetId ||
      parameter.path === targetId ||
      parameter.name === targetId ||
      parameter.aliases.includes(targetId),
  );
}
