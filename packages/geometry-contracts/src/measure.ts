import { z } from 'zod';

export type Vec3 = readonly [number, number, number];

export const MeasureKindSchema = z.enum(['distance', 'edgeLength', 'faceArea', 'angle']);
export type MeasureKind = z.infer<typeof MeasureKindSchema>;

export const MeasureUnitSchema = z.enum(['mm', 'mm2', 'deg']);
export type MeasureUnit = z.infer<typeof MeasureUnitSchema>;

export const MeasureProvenanceSchema = z.enum(['brep', 'mesh-indicative']);
export type MeasureProvenance = z.infer<typeof MeasureProvenanceSchema>;

export const MeasureEngineSchema = z.object({
  layer: z.enum(['reference', 'geometry-service']),
  kernel: z.string().min(1),
  label: z.string().min(1),
});
export type MeasureEngine = z.infer<typeof MeasureEngineSchema>;

export const BoxExtentsSchema = z.object({
  min: z.tuple([z.number(), z.number(), z.number()]),
  max: z.tuple([z.number(), z.number(), z.number()]),
});

export const MeasureRequestSchema = z
  .object({
    kind: MeasureKindSchema,
    semanticOwner: z.string().min(1).optional(),
    representationId: z.string().min(1).optional(),
    /** When set, measure against these extents without a stored solid. */
    extentsMm: BoxExtentsSchema.optional(),
    /** Semantic feature paths, e.g. semantic:owner/box/edge:0 */
    features: z.array(z.string().min(1)).min(1).max(2),
    layer: z.enum(['reference', 'geometry-service']).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.semanticOwner && !val.representationId && !val.extentsMm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'semanticOwner, representationId, or extentsMm required',
      });
    }
    const n = val.features.length;
    if ((val.kind === 'distance' || val.kind === 'angle') && n !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${val.kind} requires exactly 2 features`,
      });
    }
    if ((val.kind === 'edgeLength' || val.kind === 'faceArea') && n !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${val.kind} requires exactly 1 feature`,
      });
    }
  });
export type MeasureRequest = z.infer<typeof MeasureRequestSchema>;

export const MeasureResultSchema = z.object({
  kind: MeasureKindSchema,
  quantity: z.number(),
  unit: MeasureUnitSchema,
  provenance: MeasureProvenanceSchema,
  engine: MeasureEngineSchema,
  features: z.array(z.string()),
  meshIndicative: z.number().optional(),
});
export type MeasureResult = z.infer<typeof MeasureResultSchema>;

export const MeasureCompareResultSchema = z.object({
  kind: MeasureKindSchema,
  features: z.array(z.string()),
  exact: MeasureResultSchema.optional(),
  occt: MeasureResultSchema.optional(),
  delta: z.number().optional(),
  tolerance: z.number(),
  toleranceUnit: MeasureUnitSchema,
  withinTolerance: z.boolean(),
});
export type MeasureCompareResult = z.infer<typeof MeasureCompareResultSchema>;

export const FACE_KEYS = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
export type FaceKey = (typeof FACE_KEYS)[number];

export interface BoxExtents {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface BoxVertex {
  readonly index: number;
  readonly path: string;
  readonly position: Vec3;
}

export interface BoxEdge {
  readonly index: number;
  readonly path: string;
  readonly a: number;
  readonly b: number;
  readonly start: Vec3;
  readonly end: Vec3;
  readonly direction: Vec3;
  readonly lengthMm: number;
}

export interface BoxFace {
  readonly key: FaceKey;
  readonly path: string;
  readonly normal: Vec3;
  readonly center: Vec3;
  readonly areaMm2: number;
}

/** Corner order: ---, +--, ++-, -+-, --+, +-+, +++ , -++ */
const VERTEX_SIGNS: readonly Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

/** 12 edges as vertex-index pairs. */
const EDGE_PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

function corner(extents: BoxExtents, signs: Vec3): Vec3 {
  const { min, max } = extents;
  return [
    signs[0] ? max[0] : min[0],
    signs[1] ? max[1] : min[1],
    signs[2] ? max[2] : min[2],
  ];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len < 1e-12) return [0, 0, 0];
  return [a[0] / len, a[1] / len, a[2] / len];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function distanceMm(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/**
 * Angle between two directions in degrees, range [0, 180].
 * Directions are treated as undirected (uses absolute cosine).
 */
export function angleBetweenDirectionsDeg(a: Vec3, b: Vec3): number {
  const na = normalize(a);
  const nb = normalize(b);
  const c = Math.min(1, Math.max(-1, Math.abs(dot(na, nb))));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Face–face angle from normals; undirected, [0, 180]. Parallel same-sense → 0°. */
export function angleBetweenFacesDeg(normalA: Vec3, normalB: Vec3): number {
  return angleBetweenDirectionsDeg(normalA, normalB);
}

export function angleBetweenEdgesDeg(dirA: Vec3, dirB: Vec3): number {
  return angleBetweenDirectionsDeg(dirA, dirB);
}

export function boxFeaturePath(owner: string, kind: 'vertex' | 'edge' | 'face', id: string | number): string {
  const base = owner.startsWith('semantic:') ? owner : `semantic:${owner}`;
  return `${base}/box/${kind}:${id}`;
}

export function boxVertices(owner: string, extents: BoxExtents): readonly BoxVertex[] {
  return VERTEX_SIGNS.map((signs, index) => ({
    index,
    path: boxFeaturePath(owner, 'vertex', index),
    position: corner(extents, signs),
  }));
}

export function boxEdges(owner: string, extents: BoxExtents): readonly BoxEdge[] {
  const verts = boxVertices(owner, extents);
  return EDGE_PAIRS.map(([a, b], index) => {
    const start = verts[a]!.position;
    const end = verts[b]!.position;
    const direction = sub(end, start);
    return {
      index,
      path: boxFeaturePath(owner, 'edge', index),
      a,
      b,
      start,
      end,
      direction,
      lengthMm: length(direction),
    };
  });
}

export function boxFaces(owner: string, extents: BoxExtents): readonly BoxFace[] {
  const { min, max } = extents;
  const sx = max[0] - min[0];
  const sy = max[1] - min[1];
  const sz = max[2] - min[2];
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const faces: BoxFace[] = [
    {
      key: '+x',
      path: boxFeaturePath(owner, 'face', '+x'),
      normal: [1, 0, 0],
      center: [max[0], cy, cz],
      areaMm2: sy * sz,
    },
    {
      key: '-x',
      path: boxFeaturePath(owner, 'face', '-x'),
      normal: [-1, 0, 0],
      center: [min[0], cy, cz],
      areaMm2: sy * sz,
    },
    {
      key: '+y',
      path: boxFeaturePath(owner, 'face', '+y'),
      normal: [0, 1, 0],
      center: [cx, max[1], cz],
      areaMm2: sx * sz,
    },
    {
      key: '-y',
      path: boxFeaturePath(owner, 'face', '-y'),
      normal: [0, -1, 0],
      center: [cx, min[1], cz],
      areaMm2: sx * sz,
    },
    {
      key: '+z',
      path: boxFeaturePath(owner, 'face', '+z'),
      normal: [0, 0, 1],
      center: [cx, cy, max[2]],
      areaMm2: sx * sy,
    },
    {
      key: '-z',
      path: boxFeaturePath(owner, 'face', '-z'),
      normal: [0, 0, -1],
      center: [cx, cy, min[2]],
      areaMm2: sx * sy,
    },
  ];
  return faces;
}

export type ResolvedBoxFeature =
  | { readonly kind: 'vertex'; readonly vertex: BoxVertex }
  | { readonly kind: 'edge'; readonly edge: BoxEdge }
  | { readonly kind: 'face'; readonly face: BoxFace };

export function parseBoxFeaturePath(
  path: string,
): { owner: string; kind: 'vertex' | 'edge' | 'face'; id: string } | null {
  const m = path.match(/^(semantic:.+)\/box\/(vertex|edge|face):(.+)$/);
  if (!m) return null;
  return { owner: m[1]!, kind: m[2] as 'vertex' | 'edge' | 'face', id: m[3]! };
}

export function resolveBoxFeature(
  path: string,
  extents: BoxExtents,
): ResolvedBoxFeature | null {
  const parsed = parseBoxFeaturePath(path);
  if (!parsed) return null;
  const owner = parsed.owner.replace(/^semantic:/, '');
  if (parsed.kind === 'vertex') {
    const requested = Number(parsed.id);
    if (!Number.isInteger(requested) || requested < 0 || requested >= VERTEX_SIGNS.length) return null;
    const index = requested === 0 ? 0 : requested;
    return { kind: 'vertex', vertex: { index, path: boxFeaturePath(owner, 'vertex', index),
      position: corner(extents, VERTEX_SIGNS[index]!) } };
  }
  if (parsed.kind === 'edge') {
    const requested = Number(parsed.id);
    if (!Number.isInteger(requested) || requested < 0 || requested >= EDGE_PAIRS.length) return null;
    const index = requested === 0 ? 0 : requested;
    // Resolve only the requested edge instead of allocating all 8 vertices and 12 edges.
    const [a, b] = EDGE_PAIRS[index]!;
    const start = corner(extents, VERTEX_SIGNS[a]!);
    const end = corner(extents, VERTEX_SIGNS[b]!);
    const direction = sub(end, start);
    return { kind: 'edge', edge: { index, path: boxFeaturePath(owner, 'edge', index), a, b,
      start, end, direction, lengthMm: length(direction) } };
  }
  const f = boxFaces(owner, extents).find((x) => x.key === parsed.id);
  return f ? { kind: 'face', face: f } : null;
}

export function measureBoxFeatures(
  kind: MeasureKind,
  features: readonly string[],
  extents: BoxExtents,
): { quantity: number; unit: MeasureUnit } {
  if (kind === 'distance') {
    const a = resolveBoxFeature(features[0]!, extents);
    const b = resolveBoxFeature(features[1]!, extents);
    if (!a || a.kind !== 'vertex' || !b || b.kind !== 'vertex') {
      throw new Error('distance requires two vertex features');
    }
    return { quantity: distanceMm(a.vertex.position, b.vertex.position), unit: 'mm' };
  }
  if (kind === 'edgeLength') {
    const e = resolveBoxFeature(features[0]!, extents);
    if (!e || e.kind !== 'edge') throw new Error('edgeLength requires one edge feature');
    return { quantity: e.edge.lengthMm, unit: 'mm' };
  }
  if (kind === 'faceArea') {
    const f = resolveBoxFeature(features[0]!, extents);
    if (!f || f.kind !== 'face') throw new Error('faceArea requires one face feature');
    return { quantity: f.face.areaMm2, unit: 'mm2' };
  }
  if (kind === 'angle') {
    const a = resolveBoxFeature(features[0]!, extents);
    const b = resolveBoxFeature(features[1]!, extents);
    if (!a || !b) throw new Error('angle requires two resolvable features');
    if (a.kind === 'edge' && b.kind === 'edge') {
      return { quantity: angleBetweenEdgesDeg(a.edge.direction, b.edge.direction), unit: 'deg' };
    }
    if (a.kind === 'face' && b.kind === 'face') {
      return { quantity: angleBetweenFacesDeg(a.face.normal, b.face.normal), unit: 'deg' };
    }
    throw new Error('angle requires two edges or two faces');
  }
  const _never: never = kind;
  throw new Error(`unknown measure kind: ${_never}`);
}

export function defaultCompareTolerance(kind: MeasureKind): { tolerance: number; unit: MeasureUnit } {
  switch (kind) {
    case 'distance':
    case 'edgeLength':
      return { tolerance: 0.5, unit: 'mm' };
    case 'faceArea':
      return { tolerance: 1, unit: 'mm2' };
    case 'angle':
      return { tolerance: 0.25, unit: 'deg' };
    default: {
      const _never: never = kind;
      throw new Error(`unknown kind ${_never}`);
    }
  }
}

export function compareMeasureResults(
  kind: MeasureKind,
  features: readonly string[],
  exact: MeasureResult | undefined,
  occt: MeasureResult | undefined,
): MeasureCompareResult {
  const { tolerance, unit } = defaultCompareTolerance(kind);
  const delta =
    exact !== undefined && occt !== undefined ? Math.abs(exact.quantity - occt.quantity) : undefined;
  return {
    kind,
    features: [...features],
    ...(exact !== undefined ? { exact } : {}),
    ...(occt !== undefined ? { occt } : {}),
    ...(delta !== undefined ? { delta } : {}),
    tolerance,
    toleranceUnit: unit,
    withinTolerance: delta !== undefined ? delta <= tolerance : false,
  };
}

/** Midpoint helper for overlays. */
export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return scale(add(a, b), 0.5);
}
