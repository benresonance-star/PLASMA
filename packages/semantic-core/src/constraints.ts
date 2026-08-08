import { z } from 'zod';
import { SemanticObjectSchema } from './envelope.js';
import { QuantitySchema } from './parameters.js';

export const CONSTRAINT_CATEGORIES = [
  'validation',
  'geometric',
  'relational',
  'solvable',
  'fabrication',
  'analysis',
  'advisory',
] as const;

export type ConstraintCategory = (typeof CONSTRAINT_CATEGORIES)[number];

export const ConstraintSchema = SemanticObjectSchema.extend({
  kind: z.literal('Constraint'),
  category: z.enum(CONSTRAINT_CATEGORIES),
  operator: z.enum([
    'less-than',
    'less-than-or-equal',
    'greater-than',
    'greater-than-or-equal',
    'equal',
    'not-equal',
  ]),
  property: z.string().min(1),
  limit: QuantitySchema.optional(),
  severity: z.enum(['hard', 'soft', 'advisory']),
  reason: z.string().min(1),
  targetIds: z.array(z.string()).default([]),
});

export type Constraint = z.infer<typeof ConstraintSchema>;

export const ObjectiveSchema = SemanticObjectSchema.extend({
  kind: z.literal('Objective'),
  direction: z.enum(['minimise', 'maximise']),
  property: z.string().min(1),
});

export type Objective = z.infer<typeof ObjectiveSchema>;

export function parseConstraint(input: unknown): Constraint {
  return ConstraintSchema.parse(input);
}

export function parseObjective(input: unknown): Objective {
  return ObjectiveSchema.parse(input);
}
