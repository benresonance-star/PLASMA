import { z } from 'zod';
import { sha256Canonical } from '@spds/reproducibility';
import { GeometryRepresentationSchema, MeshSchema, Vec3Schema } from './dto.js';

const OCCT_CLASS_NAME = /\b(TopoDS_|BRep_|Geom_|gp_|AIS_|TCol)/;

/** Kernel-neutral geometry op — PIR operators only, never OCCT class names. */
const GeometryCompileOpBaseSchema = z.object({
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  featurePath: z.string().min(1).optional(),
  visibility: z.enum(['display', 'construction']).optional(),
});

const GeometrySweepCompileOpSchema = GeometryCompileOpBaseSchema.extend({
  op: z.literal('geometry.sweep@1.0.0'),
    path: z.array(Vec3Schema).min(2),
    profileWidthMm: z.number().positive(),
    profileDepthMm: z.number().positive(),
    wallThicknessMm: z.number().positive().optional(),
    profileUp: Vec3Schema.optional(),
});

const GeometryExtrudeCompileOpSchema = GeometryCompileOpBaseSchema.extend({
  op: z.literal('geometry.extrude@1.0.0'),
  profile: z.array(Vec3Schema).min(3),
  vector: Vec3Schema,
});

const GeometryRevolveCompileOpSchema = GeometryCompileOpBaseSchema.extend({
  op: z.literal('geometry.revolve@1.0.0'),
  profile: z.array(Vec3Schema).min(3),
  axisOrigin: Vec3Schema,
  axisDirection: Vec3Schema,
  angleDeg: z.number().positive().max(360),
  segments: z.number().int().min(3).max(256).default(32),
});

const GeometryLoftCompileOpSchema = GeometryCompileOpBaseSchema.extend({
  op: z.literal('geometry.loft@1.0.0'),
  profiles: z.array(z.array(Vec3Schema).min(3)).min(2),
  ruled: z.boolean().default(true),
});

const GeometryBooleanCompileOpSchema = GeometryCompileOpBaseSchema.extend({
  op: z.literal('geometry.boolean@1.0.0'),
  operation: z.enum(['union', 'cut', 'intersect']),
  leftOperationId: z.string().min(1),
  rightOperationId: z.string().min(1),
});

const GeometryTrimPlaneCompileOpSchema = GeometryCompileOpBaseSchema.extend({
  op: z.literal('geometry.trim-plane@1.0.0'),
  sourceOperationId: z.string().min(1),
  planeOrigin: Vec3Schema,
  planeNormal: Vec3Schema,
  keep: z.enum(['positive', 'negative']),
});

const GeometryEdgeFilletCompileOpSchema = GeometryCompileOpBaseSchema.extend({
  op: z.literal('geometry.edge-fillet@1.0.0'),
  sourceOperationId: z.string().min(1),
  edgePaths: z.array(z.string().min(1)).min(1),
  radiusMm: z.number().positive(),
});

const GeometryEdgeChamferCompileOpSchema = GeometryCompileOpBaseSchema.extend({
  op: z.literal('geometry.edge-chamfer@1.0.0'),
  sourceOperationId: z.string().min(1),
  edgePaths: z.array(z.string().min(1)).min(1),
  distanceMm: z.number().positive(),
});

const GeometryFaceShellCompileOpSchema = GeometryCompileOpBaseSchema.extend({
  op: z.literal('geometry.face-shell@1.0.0'),
  sourceOperationId: z.string().min(1),
  removedFacePaths: z.array(z.string().min(1)).min(1),
  thicknessMm: z.number().positive(),
  inward: z.boolean().default(true),
});

const GeometryFaceDraftCompileOpSchema = GeometryCompileOpBaseSchema.extend({
  op: z.literal('geometry.face-draft@1.0.0'),
  sourceOperationId: z.string().min(1),
  selectedFacePaths: z.array(z.string().min(1)).min(1),
  pullDirection: Vec3Schema,
  neutralPlaneOrigin: Vec3Schema,
  neutralPlaneNormal: Vec3Schema,
  angleDeg: z.number().min(0.01).max(45),
  reverse: z.boolean().default(false),
});

export const GeometryCompileOpSchema = z
  .discriminatedUnion('op', [
    GeometrySweepCompileOpSchema,
    GeometryExtrudeCompileOpSchema,
    GeometryRevolveCompileOpSchema,
    GeometryLoftCompileOpSchema,
    GeometryBooleanCompileOpSchema,
    GeometryTrimPlaneCompileOpSchema,
    GeometryEdgeFilletCompileOpSchema,
    GeometryEdgeChamferCompileOpSchema,
    GeometryFaceShellCompileOpSchema,
    GeometryFaceDraftCompileOpSchema,
  ])
  .superRefine((val, ctx) => {
    const blob = `${val.op}${val.pirOperationId}${val.semanticOwner}`;
    if (OCCT_CLASS_NAME.test(blob)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Compile ops must not embed OCCT class names',
      });
    }
    if (
      val.op === 'geometry.extrude@1.0.0' &&
      Math.hypot(val.vector[0], val.vector[1], val.vector[2]) <= 1e-9
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['vector'],
        message: 'Extrusion vector must be non-zero',
      });
    }
    if (
      val.op === 'geometry.revolve@1.0.0' &&
      Math.hypot(
        val.axisDirection[0],
        val.axisDirection[1],
        val.axisDirection[2],
      ) <= 1e-9
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['axisDirection'],
        message: 'Revolve axis direction must be non-zero',
      });
    }
    if (
      val.op === 'geometry.boolean@1.0.0' &&
      val.leftOperationId === val.rightOperationId
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['rightOperationId'],
        message: 'Boolean operands must reference different operations',
      });
    }
    if (
      val.op === 'geometry.trim-plane@1.0.0' &&
      Math.hypot(
        val.planeNormal[0],
        val.planeNormal[1],
        val.planeNormal[2],
      ) <= 1e-9
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['planeNormal'],
        message: 'Trim plane normal must be non-zero',
      });
    }
    if (
      (val.op === 'geometry.edge-fillet@1.0.0' ||
        val.op === 'geometry.edge-chamfer@1.0.0') &&
      new Set(val.edgePaths).size !== val.edgePaths.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['edgePaths'],
        message: 'Edge paths must be unique',
      });
    }
    if (
      val.op === 'geometry.face-shell@1.0.0' &&
      new Set(val.removedFacePaths).size !== val.removedFacePaths.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['removedFacePaths'],
        message: 'Removed face paths must be unique',
      });
    }
    if (
      val.op === 'geometry.face-draft@1.0.0' &&
      new Set(val.selectedFacePaths).size !== val.selectedFacePaths.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedFacePaths'],
        message: 'Selected face paths must be unique',
      });
    }
    if (
      val.op === 'geometry.face-draft@1.0.0' &&
      Math.hypot(...val.pullDirection) <= 1e-9
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['pullDirection'],
        message: 'Draft pull direction must be non-zero',
      });
    }
    if (
      val.op === 'geometry.face-draft@1.0.0' &&
      Math.hypot(...val.neutralPlaneNormal) <= 1e-9
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['neutralPlaneNormal'],
        message: 'Draft neutral-plane normal must be non-zero',
      });
    }
  });

export const GeometryCompileRequestSchema = z.object({
  snapshotHash: z.string().min(1),
  pirHash: z.string().min(1),
  dagHash: z.string().min(1),
  compilerVersion: z.string().min(1),
  /** Schema parameters that feed geometry (e.g. lengthMm). Part of SOT digest. */
  parameters: z.record(z.string(), z.number()).default({}),
  ops: z.array(GeometryCompileOpSchema).min(1),
  chordDeviationMm: z.number().positive().default(1),
  angleDeviationDeg: z.number().positive().default(20),
});

export const GeometryCompileMeshSchema = z.object({
  representationId: z.string().min(1),
  semanticOwner: z.string().min(1),
  pirOperationId: z.string().min(1),
  kernel: z.enum(['exact-adapter', 'occt-wasm', 'occt-native']),
  vertices: z.array(Vec3Schema),
  indices: z.array(z.number().int().nonnegative()),
  triangleCount: z.number().int().nonnegative(),
  maxDeviationMm: z.number().nonnegative(),
});

export const GeometryCompileResultSchema = z.object({
  compileHash: z.string().min(1),
  snapshotHash: z.string().min(1),
  pirHash: z.string().min(1),
  dagHash: z.string().min(1),
  compilerVersion: z.string().min(1),
  parameters: z.record(z.string(), z.number()),
  representations: z.array(GeometryRepresentationSchema),
  meshes: z.array(GeometryCompileMeshSchema),
  artifactHashes: z.array(z.string()).default([]),
});

export type GeometryCompileOp = z.infer<typeof GeometryCompileOpSchema>;
export type GeometryCompileRequest = z.infer<typeof GeometryCompileRequestSchema>;
export type GeometryCompileMesh = z.infer<typeof GeometryCompileMeshSchema>;
export type GeometryCompileResult = z.infer<typeof GeometryCompileResultSchema>;

export function parseGeometryCompileRequest(input: unknown): GeometryCompileRequest {
  return GeometryCompileRequestSchema.parse(input);
}

export function compileRequestDigest(req: GeometryCompileRequest): string {
  return sha256Canonical({
    snapshotHash: req.snapshotHash,
    pirHash: req.pirHash,
    dagHash: req.dagHash,
    parameters: req.parameters,
    ops: req.ops,
    chordDeviationMm: req.chordDeviationMm,
    angleDeviationDeg: req.angleDeviationDeg,
  });
}

/** Re-export MeshSchema for compile consumers. */
export { MeshSchema };
