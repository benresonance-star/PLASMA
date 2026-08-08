import { z } from 'zod';

export const PATTERN_LIFECYCLE = ['draft', 'validated', 'published', 'deprecated'] as const;

export const PatternDefinitionSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  lifecycle: z.enum(PATTERN_LIFECYCLE).default('draft'),
  intent: z.array(z.string()).default([]),
  applicableTo: z.array(z.string()).default([]),
  requires: z.array(z.string()).default([]),
  parameters: z.array(z.unknown()).default([]),
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

export function parsePatternDefinition(input: unknown): PatternDefinition {
  return PatternDefinitionSchema.parse(input);
}
