import { z } from 'zod';
import { SemanticObjectSchema } from './envelope.js';

export const AFFECTOR_TYPES = [
  'geometry.plane-cut',
  'geometry.box-exclusion',
  'geometry.radial-distance-field',
  'geometry.directional-field',
  'geometry.scalar-gradient',
] as const;

export const AffectorSchema = SemanticObjectSchema.extend({
  kind: z.literal('Affector'),
  semanticType: z.enum(AFFECTOR_TYPES),
  coordinateSpace: z.enum(['world', 'project', 'assembly', 'component']),
  operation: z.enum(['subtract', 'modify-parameter', 'exclude']),
  target: z.string().min(1),
  preserveSemanticIdentity: z.boolean().default(true),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

export type Affector = z.infer<typeof AffectorSchema>;

export function parseAffector(input: unknown): Affector {
  return AffectorSchema.parse(input);
}
