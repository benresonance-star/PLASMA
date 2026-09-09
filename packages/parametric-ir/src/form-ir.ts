import { z } from 'zod';

export const FormProductSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('topology'),
    topologyType: z.enum(['graph', 'cells', 'network', 'mesh-topology']),
    capabilities: z.array(z.string().min(1)).default([]),
  }),
  z.object({
    kind: z.literal('geometry'),
    geometryType: z.enum(['point', 'curve', 'profile', 'surface', 'solid']),
    capabilities: z.array(z.string().min(1)).default([]),
  }),
  z.object({
    kind: z.literal('assembly'),
    capabilities: z.array(z.string().min(1)).default([]),
  }),
  z.object({
    kind: z.literal('field'),
    valueType: z.enum(['scalar', 'vector', 'boolean', 'category']),
    capabilities: z.array(z.string().min(1)).default([]),
  }),
]);

export type FormProduct = z.infer<typeof FormProductSchema>;

export function parseFormProduct(input: unknown): FormProduct {
  return FormProductSchema.parse(input);
}
