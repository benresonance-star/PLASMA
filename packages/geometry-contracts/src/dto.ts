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
  featurePath: z.string().min(1).optional(),
  profileUp: Vec3Schema.optional(),
});

export const ExtrudeRequestSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  profile: z.array(Vec3Schema).min(3),
  vector: Vec3Schema,
  featurePath: z.string().min(1).optional(),
});

export const RevolveRequestSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  profile: z.array(Vec3Schema).min(3),
  axisOrigin: Vec3Schema,
  axisDirection: Vec3Schema,
  angleDeg: z.number().positive().max(360),
  segments: z.number().int().min(3).max(256).default(32),
  featurePath: z.string().min(1).optional(),
});

export const LoftRequestSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  profiles: z.array(z.array(Vec3Schema).min(3)).min(2),
  ruled: z.boolean().default(true),
  featurePath: z.string().min(1).optional(),
});

export const BooleanRequestSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  operation: z.enum(['union', 'cut', 'intersect']),
  leftRepresentationId: z.string().min(1),
  rightRepresentationId: z.string().min(1),
  featurePath: z.string().min(1).optional(),
});

export const TrimPlaneRequestSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  sourceRepresentationId: z.string().min(1),
  planeOrigin: Vec3Schema,
  planeNormal: Vec3Schema,
  keep: z.enum(['positive', 'negative']),
  featurePath: z.string().min(1).optional(),
});

const EdgePathsSchema = z
  .array(z.string().min(1))
  .min(1)
  .refine((paths) => new Set(paths).size === paths.length, {
    message: 'Edge paths must be unique',
  });

export const EdgeFilletRequestSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  sourceRepresentationId: z.string().min(1),
  edgePaths: EdgePathsSchema,
  radiusMm: z.number().positive(),
  featurePath: z.string().min(1).optional(),
});

export const EdgeChamferRequestSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  sourceRepresentationId: z.string().min(1),
  edgePaths: EdgePathsSchema,
  distanceMm: z.number().positive(),
  featurePath: z.string().min(1).optional(),
});

export const FaceShellRequestSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  sourceRepresentationId: z.string().min(1),
  removedFacePaths: z
    .array(z.string().min(1))
    .min(1)
    .refine((paths) => new Set(paths).size === paths.length, {
      message: 'Removed face paths must be unique',
    }),
  thicknessMm: z.number().positive(),
  inward: z.boolean().default(true),
  featurePath: z.string().min(1).optional(),
});

export const FaceDraftRequestSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  sourceRepresentationId: z.string().min(1),
  selectedFacePaths: z
    .array(z.string().min(1))
    .min(1)
    .refine((paths) => new Set(paths).size === paths.length, {
      message: 'Selected face paths must be unique',
    }),
  pullDirection: Vec3Schema,
  neutralPlaneOrigin: Vec3Schema,
  neutralPlaneNormal: Vec3Schema,
  angleDeg: z.number().min(0.01).max(45),
  reverse: z.boolean().default(false),
  featurePath: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (Math.hypot(...value.pullDirection) <= 1e-9) {
    ctx.addIssue({
      code: 'custom',
      path: ['pullDirection'],
      message: 'Draft pull direction must be non-zero',
    });
  }
  if (Math.hypot(...value.neutralPlaneNormal) <= 1e-9) {
    ctx.addIssue({
      code: 'custom',
      path: ['neutralPlaneNormal'],
      message: 'Draft neutral-plane normal must be non-zero',
    });
  }
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

export const GeometryTopologyElementSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['edge', 'face']),
  boundsMm: z.object({
    min: Vec3Schema,
    max: Vec3Schema,
  }),
  source: z
    .object({
      role: z.string().min(1),
      index: z.number().int().nonnegative(),
    })
    .optional(),
});

export const GeometryRepresentationSchema = z.object({
  id: z.string().min(1),
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  kernel: z.enum(['occt-wasm', 'exact-adapter', 'occt-native']),
  validationState: z.enum([
    'geometry-generated',
    'geometry-approximated',
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
  topologyElements: z.array(GeometryTopologyElementSchema).optional(),
  fabricationReady: z.boolean(),
});

export type SweepRequest = z.infer<typeof SweepRequestSchema>;
export type ExtrudeRequest = z.infer<typeof ExtrudeRequestSchema>;
export type RevolveRequest = z.infer<typeof RevolveRequestSchema>;
export type LoftRequest = z.infer<typeof LoftRequestSchema>;
export type BooleanRequest = z.infer<typeof BooleanRequestSchema>;
export type TrimPlaneRequest = z.infer<typeof TrimPlaneRequestSchema>;
export type EdgeFilletRequest = z.infer<typeof EdgeFilletRequestSchema>;
export type EdgeChamferRequest = z.infer<typeof EdgeChamferRequestSchema>;
export type FaceShellRequest = z.infer<typeof FaceShellRequestSchema>;
export type FaceDraftRequest = z.infer<typeof FaceDraftRequestSchema>;
export type TessellateRequest = z.infer<typeof TessellateRequestSchema>;
export type ShellRequest = z.infer<typeof ShellRequestSchema>;
export type GeometryRepresentation = z.infer<typeof GeometryRepresentationSchema>;
export type GeometryTopologyElement = z.infer<
  typeof GeometryTopologyElementSchema
>;
export type Mesh = z.infer<typeof MeshSchema>;
