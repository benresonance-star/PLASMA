import { z } from 'zod';
import { isSemanticId } from './ids.js';
import { SEMANTIC_KINDS } from './kinds.js';

export const CURRENT_SCHEMA_VERSION = '1.0.0';

export const SemanticObjectSchema = z.object({
  id: z.string().refine(isSemanticId, { message: 'Invalid semantic ID' }),
  kind: z.enum(SEMANTIC_KINDS),
  semanticType: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  schemaVersion: z.string().min(1),
});

export type SemanticObject = z.infer<typeof SemanticObjectSchema>;

export function parseSemanticObject(input: unknown): SemanticObject {
  return SemanticObjectSchema.parse(input);
}
