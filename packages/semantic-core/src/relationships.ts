import { z } from 'zod';
import { isSemanticId } from './ids.js';
import { SemanticObjectSchema } from './envelope.js';

export const CORE_RELATIONSHIP_TYPES = [
  'part-of',
  'generated-from',
  'connects-to',
  'bounds',
  'adjacent-to',
  'affected-by',
  'governed-by',
  'represented-by',
  'analysed-as',
  'manufactured-as',
  'requires',
  'produces',
  'depends-on',
] as const;

export type CoreRelationshipType = (typeof CORE_RELATIONSHIP_TYPES)[number];

/** Extendable vocabulary — core types plus custom namespaced relations. */
export const RelationshipTypeSchema = z.union([
  z.enum(CORE_RELATIONSHIP_TYPES),
  z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/, 'Custom relation must be namespaced'),
]);

export const RelationshipSchema = SemanticObjectSchema.extend({
  kind: z.literal('Relationship'),
  relationType: RelationshipTypeSchema,
  from: z.string().refine(isSemanticId),
  to: z.string().refine(isSemanticId),
});

export type Relationship = z.infer<typeof RelationshipSchema>;

export function parseRelationship(input: unknown): Relationship {
  return RelationshipSchema.parse(input);
}
