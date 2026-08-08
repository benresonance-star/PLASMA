import { z } from 'zod';

/** Layer stack order: base → specialisation → project → experiment (later wins). */
export const COMPOSITION_LAYER_ORDER = [
  'base',
  'specialisation',
  'project',
  'experiment',
] as const;

export type CompositionLayer = (typeof COMPOSITION_LAYER_ORDER)[number];

export const ParameterOverrideSchema = z.object({
  path: z.string().min(1),
  value: z.unknown(),
});

export const CompositionLayerSchema = z.object({
  layer: z.enum(COMPOSITION_LAYER_ORDER),
  baseRef: z.string().min(1).optional(),
  overrides: z.array(ParameterOverrideSchema).default([]),
});

export const VariantDimensionSchema = z.enum([
  'geometry',
  'material',
  'connection',
  'fabrication',
]);

export const VariantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  dimension: VariantDimensionSchema,
  overrides: z.array(ParameterOverrideSchema).default([]),
});

export const VariantSetSchema = z.object({
  id: z.string().min(1),
  variants: z.array(VariantSchema).min(1),
});

export const VariantSelectionSchema = z.object({
  variantSetId: z.string().min(1),
  selectedVariantIds: z.array(z.string().min(1)).min(1),
});

export const CompositionDocumentSchema = z.object({
  id: z.string().min(1),
  publishedBaseId: z.string().min(1),
  publishedBaseImmutable: z.literal(true),
  layers: z.array(CompositionLayerSchema).min(1),
  variantSet: VariantSetSchema.optional(),
  variantSelection: VariantSelectionSchema.optional(),
  objects: z.record(z.string(), z.unknown()),
});

export type CompositionDocument = z.infer<typeof CompositionDocumentSchema>;
export type VariantSet = z.infer<typeof VariantSetSchema>;
export type VariantSelection = z.infer<typeof VariantSelectionSchema>;
export type ParameterOverride = z.infer<typeof ParameterOverrideSchema>;

export function parseCompositionDocument(input: unknown): CompositionDocument {
  return CompositionDocumentSchema.parse(input);
}
