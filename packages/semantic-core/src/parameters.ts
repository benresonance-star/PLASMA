import { z } from 'zod';
import { SemanticObjectSchema } from './envelope.js';

export const PARAMETER_ROLES = [
  'design-variable',
  'derived',
  'constraint-limit',
  'fabrication-variable',
  'analysis-variable',
  'presentation-only',
] as const;

export type ParameterRole = (typeof PARAMETER_ROLES)[number];

/** Physical quantity — unit is required (no untyped dimensional numbers). */
export const QuantitySchema = z.object({
  value: z.number().finite(),
  unit: z.string().min(1),
});

export const ParameterDomainSchema = z
  .object({
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .refine(
    (d) => d.min === undefined || d.max === undefined || d.min <= d.max,
    { message: 'domain.min must be <= domain.max' },
  );

export const ParameterSchema = SemanticObjectSchema.extend({
  kind: z.literal('Parameter'),
  quantity: QuantitySchema,
  domain: ParameterDomainSchema.optional(),
  role: z.enum(PARAMETER_ROLES),
  affects: z.array(z.string()).default([]),
  editableBy: z.array(z.enum(['user', 'agent', 'optimizer'])).default(['user']),
  derivedFrom: z.array(z.string()).optional(),
});

export type Parameter = z.infer<typeof ParameterSchema>;

export function parseParameter(input: unknown): Parameter {
  const param = ParameterSchema.parse(input);
  if (param.domain?.min !== undefined && param.quantity.value < param.domain.min) {
    throw new Error(`Parameter ${param.id} below domain min`);
  }
  if (param.domain?.max !== undefined && param.quantity.value > param.domain.max) {
    throw new Error(`Parameter ${param.id} above domain max`);
  }
  if (param.role === 'derived' && (!param.derivedFrom || param.derivedFrom.length === 0)) {
    throw new Error(`Derived parameter ${param.id} requires derivedFrom`);
  }
  return param;
}
