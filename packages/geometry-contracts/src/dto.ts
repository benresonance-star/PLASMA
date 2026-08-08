import { z } from 'zod';

export const GeometryErrorSchema = z.object({
  code: z.string(),
  summary: z.string(),
  recoverable: z.boolean(),
  operationOrPirId: z.string().optional(),
  affectedSemanticIds: z.array(z.string()).default([]),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type GeometryError = z.infer<typeof GeometryErrorSchema>;

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const SweepRequestSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  path: z.array(Vec3Schema).min(2),
  profileWidthMm: z.number().positive(),
  profileDepthMm: z.number().positive(),
  wallThicknessMm: z.number().positive().optional(),
});

export const TessellateRequestSchema = z.object({
  representationId: z.string().min(1),
  chordDeviationMm: z.number().positive(),
  angleDeviationDeg: z.number().positive(),
});

export const ShellRequestSchema = z.object({
  representationId: z.string().min(1),
  offsetMm: z.number(),
  semanticOwner: z.string().min(1),
});

export const MassPropsSchema = z.object({
  volumeMm3: z.number(),
  areaMm2: z.number(),
  centerOfMassMm: Vec3Schema,
});

export const MeshSchema = z.object({
  vertices: z.array(Vec3Schema),
  indices: z.array(z.number().int().nonnegative()),
  maxDeviationMm: z.number().nonnegative(),
});

export const GeometryRepresentationSchema = z.object({
  id: z.string().min(1),
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  kernel: z.enum(['occt-wasm', 'exact-adapter']),
  validationState: z.enum([
    'geometry-generated',
    'geometry-invalid',
    'shell-failed',
    'fabrication-blocked',
  ]),
  solid: z.object({
    kind: z.literal('solid'),
    extentsMm: z.object({
      min: Vec3Schema,
      max: Vec3Schema,
    }),
  }),
  mass: MassPropsSchema,
  subElementPaths: z.array(z.string()).default([]),
  fabricationReady: z.boolean(),
});

export type SweepRequest = z.infer<typeof SweepRequestSchema>;
export type TessellateRequest = z.infer<typeof TessellateRequestSchema>;
export type ShellRequest = z.infer<typeof ShellRequestSchema>;
export type GeometryRepresentation = z.infer<typeof GeometryRepresentationSchema>;
export type Mesh = z.infer<typeof MeshSchema>;
