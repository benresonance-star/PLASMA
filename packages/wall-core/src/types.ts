import { z } from 'zod';

const id = z.string().min(1).max(160);
const mm = z.number().finite().min(-1e7).max(1e7);
const positive = z.number().finite().positive().max(1e6);
export const PointSchema = z.tuple([mm, mm]);
export type Point = z.infer<typeof PointSchema>;
export const LayerSchema = z
  .object({
    id,
    materialRef: id,
    function: z.enum(['structure', 'insulation', 'finish']),
    thicknessMm: positive,
    bottomMm: mm,
    topMm: positive,
  })
  .strict();
export const OpeningSchema = z
  .object({
    id,
    hostId: id,
    segmentId: id,
    widthMm: positive,
    heightMm: positive,
    sillMm: mm,
    placement: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('centred') }).strict(),
      z
        .object({ kind: z.literal('fixed-jamb'), anchor: z.enum(['start', 'end']), distanceMm: mm })
        .strict(),
    ]),
  })
  .strict();
export type Opening = z.infer<typeof OpeningSchema>;
export const WallSchema = z
  .object({
    id,
    kind: z.literal('architecture.wall'),
    schemaVersion: z.literal('0.1.0'),
    createdRevision: id,
    featureRevision: z.number().int().positive(),
    systemRef: z.object({ id, version: id }).strict(),
    coordinateFrame: z.literal('WORLD_XY_Z_UP'),
    units: z.literal('mm'),
    segments: z
      .array(z.object({ id, start: PointSchema, end: PointSchema }).strict())
      .min(1)
      .max(32),
    baseElevationMm: mm,
    heightMm: positive,
    lateralOffsetMm: mm,
    referenceLine: z.enum(['layer-start', 'centre', 'layer-end']),
    orientation: z.union([z.literal(1), z.literal(-1)]),
    layers: z.array(LayerSchema).min(1).max(16),
    openings: z.array(OpeningSchema).max(1),
    sourceEvidenceRefs: z.array(id).max(32),
  })
  .strict();
export type Wall = z.infer<typeof WallSchema>;
const LayerEditSchema = z
  .object({
    id,
    thicknessMm: positive.optional(),
    bottomMm: mm.optional(),
    topMm: positive.optional(),
  })
  .strict();
export const WallOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CreateWall'), wall: WallSchema }).strict(),
  z
    .object({
      type: z.literal('SetWallParameters'),
      wallId: id,
      parameters: z
        .object({
          heightMm: positive.optional(),
          baseElevationMm: mm.optional(),
          lateralOffsetMm: mm.optional(),
          referenceLine: z.enum(['layer-start', 'centre', 'layer-end']).optional(),
          layers: z.array(LayerEditSchema).max(16).optional(),
          terminalLengthMm: positive.optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('MoveWall'), wallId: id, delta: PointSchema }).strict(),
  z
    .object({
      type: z.literal('StretchWall'),
      wallId: id,
      segmentId: id,
      end: z.enum(['start', 'end']),
      point: PointSchema,
    })
    .strict(),
  z.object({ type: z.literal('ReverseWall'), wallId: id }).strict(),
  z.object({ type: z.literal('HostOpening'), wallId: id, opening: OpeningSchema }).strict(),
  z.object({ type: z.literal('RemoveOpening'), wallId: id, openingId: id }).strict(),
]);
export type WallOperation = z.infer<typeof WallOperationSchema>;
export interface WallPart {
  id: string;
  layerId: string;
  segmentId: string;
  footprint: Point[];
  bottomMm: number;
  topMm: number;
  volumeMm3: number;
}
export interface WallOutput {
  id: string;
  kind: 'architecture.wall-output';
  wallId: string;
  sourceHash: string;
  featureRevision: number;
  producer: 'plasma.wall-preview@0.1.0';
  fidelity: 'analytical-preview';
  toleranceMm: number;
  issueReady: false;
  unresolved: string[];
  parts: WallPart[];
  plan: { layerId: string; segmentId: string; points: Point[] }[];
  elevation: {
    segmentId: string;
    lengthMm: number;
    heightMm: number;
    baseElevationMm: number;
    opening: { leftMm: number; widthMm: number; sillMm: number; heightMm: number } | null;
  }[];
  quantities: {
    layerId: string;
    grossVolumeM3: number;
    openingDeductionM3: number;
    netVolumeM3: number;
  }[];
  conventions: string;
}
