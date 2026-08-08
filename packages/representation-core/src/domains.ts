import { z } from 'zod';

export const TOPOLOGY_DOMAINS = ['design', 'product', 'geometric'] as const;
export type TopologyDomain = (typeof TOPOLOGY_DOMAINS)[number];

export const DesignTopologyKindSchema = z.enum([
  'cell',
  'junction',
  'member',
  'boundary',
  'connection-intent',
]);

export const ProductTopologyKindSchema = z.enum([
  'assembly',
  'part',
  'subpart',
  'connector',
  'plate',
  'fastener',
]);

export const GeometricTopologyKindSchema = z.enum([
  'compound',
  'solid',
  'shell',
  'face',
  'wire',
  'edge',
  'vertex',
]);

export const DesignTopologyNodeSchema = z.object({
  domain: z.literal('design'),
  id: z.string().min(1),
  kind: DesignTopologyKindSchema,
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export const ProductTopologyNodeSchema = z.object({
  domain: z.literal('product'),
  id: z.string().min(1),
  kind: ProductTopologyKindSchema,
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export const GeometricTopologyNodeSchema = z.object({
  domain: z.literal('geometric'),
  id: z.string().min(1),
  kind: GeometricTopologyKindSchema,
  /** Transient kernel indices must never be treated as stable design refs. */
  transientKernelIndex: z.number().int().optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export const TopologyNodeSchema = z.discriminatedUnion('domain', [
  DesignTopologyNodeSchema,
  ProductTopologyNodeSchema,
  GeometricTopologyNodeSchema,
]);

/** Explicit many-to-many mapping; never assume 1:1 across domains. */
export const TopologyMappingSchema = z.object({
  id: z.string().min(1),
  fromDomain: z.enum(TOPOLOGY_DOMAINS),
  fromId: z.string().min(1),
  toDomain: z.enum(TOPOLOGY_DOMAINS),
  toId: z.string().min(1),
  relation: z.enum(['implements', 'realizes', 'represents', 'derives']),
}).superRefine((m, ctx) => {
  if (m.fromDomain === m.toDomain) {
    ctx.addIssue({
      code: 'custom',
      message: 'Cross-domain mapping required (domain confusion rejected)',
    });
  }
});

export type DesignTopologyNode = z.infer<typeof DesignTopologyNodeSchema>;
export type ProductTopologyNode = z.infer<typeof ProductTopologyNodeSchema>;
export type GeometricTopologyNode = z.infer<typeof GeometricTopologyNodeSchema>;
export type TopologyNode = z.infer<typeof TopologyNodeSchema>;
export type TopologyMapping = z.infer<typeof TopologyMappingSchema>;

export function parseTopologyNode(input: unknown): TopologyNode {
  return TopologyNodeSchema.parse(input);
}

export function parseTopologyMapping(input: unknown): TopologyMapping {
  return TopologyMappingSchema.parse(input);
}
