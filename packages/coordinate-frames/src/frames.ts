import { z } from 'zod';
import { createSpdsError } from '@spds/failure-taxonomy';
import { CANONICAL_LENGTH_UNIT, type LengthUnit } from '@spds/shared-units';

export const FRAME_ROLES = [
  'WORLD',
  'PROJECT',
  'ASSEMBLY',
  'COMPONENT',
  'FEATURE',
  'PATTERN',
  'ANALYSIS',
  'FABRICATION',
  'IMPORT',
] as const;

export type FrameRole = (typeof FRAME_ROLES)[number];

export const CoordinateFrameSchema = z.object({
  id: z.string().min(1),
  role: z.enum(FRAME_ROLES),
  parentId: z.string().nullable(),
  units: z.enum(['mm', 'm', 'in']).default('mm'),
  handedness: z.enum(['right', 'left']).default('right'),
  upAxis: z.enum(['+X', '-X', '+Y', '-Y', '+Z', '-Z']).default('+Z'),
  forwardAxis: z.enum(['+X', '-X', '+Y', '-Y', '+Z', '-Z']).optional(),
  provenance: z.object({
    source: z.string().min(1),
    note: z.string().optional(),
  }),
});

export type CoordinateFrame = z.infer<typeof CoordinateFrameSchema>;

export function parseCoordinateFrame(input: unknown): CoordinateFrame {
  return CoordinateFrameSchema.parse(input);
}

/** 4x4 row-major homogeneous transform. */
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export const IDENTITY: Mat4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

export interface FrameTransform {
  readonly id: string;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
  readonly matrix: Mat4;
  readonly units: LengthUnit;
  readonly handedness: 'right' | 'left';
  readonly upAxis: string;
  readonly forwardAxis?: string;
  readonly provenance: { readonly source: string };
}

export function translation(xMm: number, yMm: number, zMm: number): Mat4 {
  return [1, 0, 0, xMm, 0, 1, 0, yMm, 0, 0, 1, zMm, 0, 0, 0, 1];
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[r * 4 + k]! * b[k * 4 + c]!;
      out[r * 4 + c] = sum;
    }
  }
  return out as unknown as Mat4;
}

export function composeTransforms(transforms: readonly FrameTransform[]): Mat4 {
  return transforms.reduce<Mat4>((acc, t) => multiply(acc, t.matrix), IDENTITY);
}

export function assertWorldAffectorFrame(frame: CoordinateFrame): void {
  if (frame.role !== 'WORLD') {
    throw createSpdsError({
      code: 'SEMANTIC_INVALID',
      summary: 'World-space affectors must reference WORLD frame',
      affectedSemanticIds: [frame.id],
      recoverable: true,
      suggestedNextActions: ['Set affector frame role to WORLD'],
    });
  }
}

export function resolveImportUnits(input: {
  detected?: LengthUnit;
  confirmed?: LengthUnit;
}): LengthUnit {
  if (input.detected && input.confirmed && input.detected !== input.confirmed) {
    throw createSpdsError({
      code: 'IMPORT_UNIT_AMBIGUOUS',
      summary: `Import units ambiguous: detected ${input.detected}, confirmed ${input.confirmed}`,
      affectedSemanticIds: [],
      recoverable: true,
      suggestedNextActions: ['Confirm source units explicitly'],
    });
  }
  if (!input.detected && !input.confirmed) {
    throw createSpdsError({
      code: 'IMPORT_UNIT_AMBIGUOUS',
      summary: 'Import units ambiguous: no detection or confirmation',
      affectedSemanticIds: [],
      recoverable: true,
      suggestedNextActions: ['Provide confirmed units'],
    });
  }
  return input.confirmed ?? input.detected ?? CANONICAL_LENGTH_UNIT;
}
