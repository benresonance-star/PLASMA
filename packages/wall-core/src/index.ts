import { sha256Canonical } from '@spds/reproducibility';
import {
  WallSchema,
  WallOperationSchema,
  type Opening,
  type Point,
  type Wall,
  type WallOperation,
  type WallOutput,
  type WallPart,
} from './types.js';
export * from './types.js';

export const WALL_SYSTEM = Object.freeze({ id: 'wall-system:two-layer-study', version: '0.1.0' });
export const WALL_TOLERANCE_MM = 0.01;
export class WallError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new WallError('WALL_INVALID', message);
}
export function wallSourceHash(wall: Wall): string {
  return sha256Canonical(wall);
}
export function segmentLength(segment: Wall['segments'][number]): number {
  return Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]);
}
export function openingLeft(opening: Opening, lengthMm: number): number {
  return opening.placement.kind === 'centred'
    ? (lengthMm - opening.widthMm) / 2
    : opening.placement.anchor === 'start'
      ? opening.placement.distanceMm
      : lengthMm - opening.placement.distanceMm - opening.widthMm;
}
export function validateWall(input: unknown): Wall {
  const wall = WallSchema.parse(input);
  require(wall.systemRef.id === WALL_SYSTEM.id &&
    wall.systemRef.version ===
      WALL_SYSTEM.version, 'Unsupported wall-system pin; migration must be evaluated explicitly.');
  const ids = [
    wall.id,
    ...wall.layers.map((x) => x.id),
    ...wall.segments.map((x) => x.id),
    ...wall.openings.map((x) => x.id),
  ];
  require(new Set(ids).size ===
    ids.length, 'Wall, layer, segment and opening identities must be distinct.');
  wall.layers.forEach((l) =>
    require(l.bottomMm >= 0 &&
      l.topMm > l.bottomMm &&
      l.topMm <= wall.heightMm, `Invalid vertical extents for ${l.id}.`),
  );
  wall.segments.forEach((s, i) => {
    require(segmentLength(s) > WALL_TOLERANCE_MM, `Zero-length segment ${s.id}.`);
    if (i > 0) {
      const prev = wall.segments[i - 1]!;
      require(Math.hypot(prev.end[0] - s.start[0], prev.end[1] - s.start[1]) <=
        WALL_TOLERANCE_MM, 'Polyline segments must be connected.');
      const a = [prev.end[0] - prev.start[0], prev.end[1] - prev.start[1]];
      const b = [s.end[0] - s.start[0], s.end[1] - s.start[1]];
      require((a[0]! * b[0]! + a[1]! * b[1]!) / (segmentLength(prev) * segmentLength(s)) >
        -0.999, 'Reversing/overlapping polyline segments are unsupported.');
    }
  });
  // Non-adjacent crossings and collinear overlap need a junction solver, not implicit fusion.
  for (let i = 0; i < wall.segments.length; i++)
    for (let j = i + 2; j < wall.segments.length; j++) {
      const a = wall.segments[i]!,
        b = wall.segments[j]!;
      const cross = (p: Point, q: Point, r: Point) =>
        (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      const overlapBox =
        Math.max(Math.min(a.start[0], a.end[0]), Math.min(b.start[0], b.end[0])) <=
          Math.min(Math.max(a.start[0], a.end[0]), Math.max(b.start[0], b.end[0])) +
            WALL_TOLERANCE_MM &&
        Math.max(Math.min(a.start[1], a.end[1]), Math.min(b.start[1], b.end[1])) <=
          Math.min(Math.max(a.start[1], a.end[1]), Math.max(b.start[1], b.end[1])) +
            WALL_TOLERANCE_MM;
      require(!(
        overlapBox &&
        cross(a.start, a.end, b.start) * cross(a.start, a.end, b.end) <= 0 &&
        cross(b.start, b.end, a.start) * cross(b.start, b.end, a.end) <= 0
      ), 'Self-intersecting paths require an explicit junction policy.');
    }
  for (const opening of wall.openings) {
    require(opening.hostId === wall.id, 'Opening host must be this wall.');
    const segment = wall.segments.find((s) => s.id === opening.segmentId);
    require(segment, 'Opening references a missing segment; explicit reassignment is required.');
    const length = segmentLength(segment),
      left = openingLeft(opening, length);
    require(left >= 0 &&
      left + opening.widthMm <= length, 'Opening does not fit its host segment.');
    require(opening.sillMm >= 0 &&
      opening.sillMm + opening.heightMm <= wall.heightMm, 'Opening exceeds wall vertical bounds.');
  }
  return wall;
}

/** Typed domain operations lower to existing commands; this is not a new authority store. */
export function applyWallOperation(
  current: Wall | undefined,
  input: unknown,
  baseRevision: string,
): Wall {
  const op = WallOperationSchema.parse(input);
  if (op.type === 'CreateWall') {
    require(!current, 'Wall identity already exists.');
    return validateWall({ ...op.wall, createdRevision: baseRevision, featureRevision: 1 });
  }
  require(current && current.id === op.wallId, 'Unknown wall.');
  const wall = structuredClone(validateWall(current));
  wall.featureRevision++;
  switch (op.type) {
    case 'SetWallParameters': {
      const { layers, terminalLengthMm, ...parameters } = op.parameters;
      if (terminalLengthMm !== undefined) {
        const segment = wall.segments.at(-1)!;
        const scale = terminalLengthMm / segmentLength(segment);
        segment.end = [
          segment.start[0] + (segment.end[0] - segment.start[0]) * scale,
          segment.start[1] + (segment.end[1] - segment.start[1]) * scale,
        ];
      }
      if (parameters.heightMm !== undefined) {
        for (const layer of wall.layers)
          if (layer.topMm === wall.heightMm) layer.topMm = parameters.heightMm;
      }
      Object.assign(wall, parameters);
      require(new Set(layers?.map((l) => l.id)).size ===
        (layers?.length ?? 0), 'Each layer has one active parameter writer.');
      for (const edit of layers ?? []) {
        const layer = wall.layers.find((l) => l.id === edit.id);
        require(layer, 'Unknown layer; changing total thickness requires explicit layer allocation.');
        Object.assign(layer, edit);
      }
      break;
    }
    case 'MoveWall':
      wall.segments = wall.segments.map((s) => ({
        ...s,
        start: [s.start[0] + op.delta[0], s.start[1] + op.delta[1]],
        end: [s.end[0] + op.delta[0], s.end[1] + op.delta[1]],
      }));
      break;
    case 'StretchWall': {
      const index = wall.segments.findIndex((s) => s.id === op.segmentId);
      require(index >= 0, 'Unknown path segment.');
      wall.segments[index]![op.end] = op.point;
      if (op.end === 'start' && index > 0) wall.segments[index - 1]!.end = op.point;
      if (op.end === 'end' && index + 1 < wall.segments.length)
        wall.segments[index + 1]!.start = op.point;
      break;
    }
    case 'ReverseWall':
      wall.segments = wall.segments.reverse().map((s) => ({ ...s, start: s.end, end: s.start }));
      wall.orientation = wall.orientation === 1 ? -1 : 1;
      wall.lateralOffsetMm = -wall.lateralOffsetMm;
      for (const opening of wall.openings)
        if (opening.placement.kind === 'fixed-jamb')
          opening.placement.anchor = opening.placement.anchor === 'start' ? 'end' : 'start';
      break;
    case 'HostOpening':
      require(wall.openings.length === 0 ||
        wall.openings[0]!.id ===
          op.opening
            .id, 'Stage one supports one opening; another active opening writer is rejected.');
      wall.openings = [op.opening];
      break;
    case 'RemoveOpening':
      require(wall.openings.some((o) => o.id === op.openingId), 'Unknown hosted opening.');
      wall.openings = [];
      break;
  }
  return validateWall(wall);
}

/** Analytical prisms only. No mesh or this quantity calculation can satisfy exact acceptance. */
export function deriveWall(input: Wall): WallOutput {
  const wall = validateWall(input),
    thickness = wall.layers.reduce((sum, l) => sum + l.thicknessMm, 0);
  const reference =
    wall.referenceLine === 'centre'
      ? thickness / 2
      : wall.referenceLine === 'layer-end'
        ? thickness
        : 0;
  const parts: WallPart[] = [],
    plan: WallOutput['plan'] = [],
    elevation: WallOutput['elevation'] = [];
  const quantities = wall.layers.map((layer) => ({
    layerId: layer.id,
    grossVolumeM3: 0,
    openingDeductionM3: 0,
    netVolumeM3: 0,
  }));
  for (const segment of wall.segments) {
    const length = segmentLength(segment),
      dx = (segment.end[0] - segment.start[0]) / length,
      dy = (segment.end[1] - segment.start[1]) / length;
    const opening = wall.openings.find((o) => o.segmentId === segment.id),
      left = opening ? openingLeft(opening, length) : 0;
    elevation.push({
      segmentId: segment.id,
      lengthMm: length,
      heightMm: wall.heightMm,
      baseElevationMm: wall.baseElevationMm,
      opening: opening
        ? {
            leftMm: left,
            widthMm: opening.widthMm,
            sillMm: opening.sillMm,
            heightMm: opening.heightMm,
          }
        : null,
    });
    let accumulated = 0;
    for (let i = 0; i < wall.layers.length; i++) {
      const layer = wall.layers[i]!,
        q = quantities[i]!;
      const near = wall.lateralOffsetMm + wall.orientation * (accumulated - reference),
        far = near + wall.orientation * layer.thicknessMm;
      const at = (x: number, y: number): Point => [
        segment.start[0] + dx * x - dy * y,
        segment.start[1] + dy * x + dx * y,
      ];
      const footprint = (x0: number, x1: number) => [
        at(x0, near),
        at(x1, near),
        at(x1, far),
        at(x0, far),
      ];
      plan.push({ layerId: layer.id, segmentId: segment.id, points: footprint(0, length) });
      const bottom = layer.bottomMm,
        top = layer.topMm;
      const cutBottom = opening ? Math.max(bottom, opening.sillMm) : 0,
        cutTop = opening ? Math.min(top, opening.sillMm + opening.heightMm) : 0;
      const rectangles: [number, number, number, number, string][] =
        opening && cutTop > cutBottom
          ? [
              [0, left, bottom, top, 'before'],
              [left + opening.widthMm, length, bottom, top, 'after'],
              [left, left + opening.widthMm, bottom, cutBottom, 'below'],
              [left, left + opening.widthMm, cutTop, top, 'above'],
            ]
          : [[0, length, bottom, top, 'whole']];
      for (const [x0, x1, z0, z1, region] of rectangles)
        if (x1 > x0 && z1 > z0) {
          parts.push({
            id: `${wall.id}/${segment.id}/${layer.id}/${region}`,
            layerId: layer.id,
            segmentId: segment.id,
            footprint: footprint(x0, x1),
            bottomMm: wall.baseElevationMm + z0,
            topMm: wall.baseElevationMm + z1,
            volumeMm3: (x1 - x0) * (z1 - z0) * layer.thicknessMm,
          });
        }
      const gross = (length * (top - bottom) * layer.thicknessMm) / 1e9;
      const deduction = opening
        ? (opening.widthMm * Math.max(0, cutTop - cutBottom) * layer.thicknessMm) / 1e9
        : 0;
      q.grossVolumeM3 += gross;
      q.openingDeductionM3 += deduction;
      q.netVolumeM3 += gross - deduction;
      accumulated += layer.thicknessMm;
    }
  }
  const unresolved = [
    'Exact geometry provider acceptance pending',
    'Room boundary and compliance evaluation pending',
  ];
  if (wall.segments.length > 1)
    unresolved.push(
      'Polyline junction allocation unresolved; quantities are sums of unjoined segment prisms',
    );
  return {
    id: `${wall.id}:output`,
    kind: 'architecture.wall-output',
    wallId: wall.id,
    sourceHash: wallSourceHash(wall),
    featureRevision: wall.featureRevision,
    producer: 'plasma.wall-preview@0.1.0',
    fidelity: 'analytical-preview',
    toleranceMm: WALL_TOLERANCE_MM,
    issueReady: false,
    unresolved,
    parts,
    plan,
    elevation,
    quantities,
    conventions:
      'Gross segment length × layer extent × thickness; rectangular opening intersection deducted per layer. No junction overlap allocation, cost rates or issued drawing claim.',
  };
}
export function wallOperationId(op: WallOperation): string {
  return op.type === 'CreateWall' ? op.wall.id : op.wallId;
}

export function createWallFixture(id = 'wall:study'): Wall {
  return {
    id,
    kind: 'architecture.wall',
    schemaVersion: '0.1.0',
    createdRevision: 'unaccepted',
    featureRevision: 1,
    systemRef: { ...WALL_SYSTEM },
    coordinateFrame: 'WORLD_XY_Z_UP',
    units: 'mm',
    segments: [{ id: `${id}:segment:1`, start: [0, 0], end: [4000, 0] }],
    baseElevationMm: 0,
    heightMm: 2700,
    lateralOffsetMm: 0,
    referenceLine: 'centre',
    orientation: 1,
    layers: [
      {
        id: `${id}:layer:core`,
        materialRef: 'material:study-core@0.1.0',
        function: 'structure',
        thicknessMm: 140,
        bottomMm: 0,
        topMm: 2700,
      },
      {
        id: `${id}:layer:finish`,
        materialRef: 'material:study-finish@0.1.0',
        function: 'finish',
        thicknessMm: 20,
        bottomMm: 0,
        topMm: 2700,
      },
    ],
    openings: [],
    sourceEvidenceRefs: [],
  };
}
