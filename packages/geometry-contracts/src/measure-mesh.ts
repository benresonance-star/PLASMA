import {
  boxEdges,
  boxFaces,
  boxFeaturePath,
  boxVertices,
  distanceMm,
  type BoxExtents,
  type Vec3,
} from './measure.js';

export function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cx = ab[1] * ac[2] - ab[2] * ac[1];
  const cy = ab[2] * ac[0] - ab[0] * ac[2];
  const cz = ab[0] * ac[1] - ab[1] * ac[0];
  return 0.5 * Math.hypot(cx, cy, cz);
}

export function faceAreaFromTriangleIndex(
  vertices: readonly Vec3[],
  indices: readonly number[],
  triangleIndex: number,
): number {
  const i = triangleIndex * 3;
  const ia = indices[i];
  const ib = indices[i + 1];
  const ic = indices[i + 2];
  if (ia === undefined || ib === undefined || ic === undefined) return 0;
  const a = vertices[ia];
  const b = vertices[ib];
  const c = vertices[ic];
  if (!a || !b || !c) return 0;
  return triangleArea(a, b, c);
}

export function snapNearestVertex(
  owner: string,
  extents: BoxExtents,
  hit: Vec3,
): { path: string; position: Vec3; distanceMm: number } {
  const verts = boxVertices(owner, extents);
  let best = verts[0]!;
  let bestD = distanceMm(hit, best.position);
  for (let i = 1; i < verts.length; i++) {
    const v = verts[i]!;
    const d = distanceMm(hit, v.position);
    if (d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return { path: best.path, position: best.position, distanceMm: bestD };
}

export function snapNearestEdge(
  owner: string,
  extents: BoxExtents,
  hit: Vec3,
): { path: string; start: Vec3; end: Vec3; closest: Vec3; distanceMm: number } {
  const edges = boxEdges(owner, extents);
  let best = edges[0]!;
  let bestClosest: Vec3 = best.start;
  let bestD = Infinity;
  for (const e of edges) {
    const { closest, dist } = closestPointOnSegment(hit, e.start, e.end);
    if (dist < bestD) {
      best = e;
      bestClosest = closest;
      bestD = dist;
    }
  }
  return {
    path: best.path,
    start: best.start,
    end: best.end,
    closest: bestClosest,
    distanceMm: bestD,
  };
}

/**
 * Resolve AABB face from the hit point (nearest face plane).
 * Prefer this over triangle normals — DoubleSide / inverted winding can point at the far face.
 */
export function snapFaceByHitPoint(
  owner: string,
  extents: BoxExtents,
  hit: Vec3,
): { path: string; key: string; center: Vec3; normal: Vec3; areaMm2: number } {
  const { min, max } = extents;
  const planeDist: { key: string; d: number }[] = [
    { key: '+x', d: Math.abs(hit[0] - max[0]) },
    { key: '-x', d: Math.abs(hit[0] - min[0]) },
    { key: '+y', d: Math.abs(hit[1] - max[1]) },
    { key: '-y', d: Math.abs(hit[1] - min[1]) },
    { key: '+z', d: Math.abs(hit[2] - max[2]) },
    { key: '-z', d: Math.abs(hit[2] - min[2]) },
  ];
  planeDist.sort((a, b) => a.d - b.d);
  const key = planeDist[0]!.key;
  const faces = boxFaces(owner, extents);
  const face = faces.find((f) => f.key === key) ?? faces[0]!;
  return {
    path: face.path,
    key: face.key,
    center: face.center,
    normal: face.normal,
    areaMm2: face.areaMm2,
  };
}

export function snapNearestFace(
  owner: string,
  extents: BoxExtents,
  hit: Vec3,
  faceNormalHint?: Vec3,
): { path: string; key: string; center: Vec3; normal: Vec3; areaMm2: number } {
  // Hit-point plane wins for solid picks (avoids through-geometry / inverted-normal bugs).
  if (!faceNormalHint) {
    return snapFaceByHitPoint(owner, extents, hit);
  }
  // If a normal is provided, still prefer the hit-plane face when it agrees within tolerance;
  // otherwise use outward normal match (after caller has flipped back-faces).
  const byPoint = snapFaceByHitPoint(owner, extents, hit);
  const faces = boxFaces(owner, extents);
  let best = faces[0]!;
  let bestDot = -Infinity;
  for (const f of faces) {
    const d =
      f.normal[0] * faceNormalHint[0] +
      f.normal[1] * faceNormalHint[1] +
      f.normal[2] * faceNormalHint[2];
    if (d > bestDot) {
      bestDot = d;
      best = f;
    }
  }
  // Near a face plane → trust the plane (click surface), not a conflicting normal.
  const { min, max } = extents;
  const planeEps =
    0.05 *
    Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1);
  const distToChosenPlane = (() => {
    switch (byPoint.key) {
      case '+x':
        return Math.abs(hit[0] - max[0]);
      case '-x':
        return Math.abs(hit[0] - min[0]);
      case '+y':
        return Math.abs(hit[1] - max[1]);
      case '-y':
        return Math.abs(hit[1] - min[1]);
      case '+z':
        return Math.abs(hit[2] - max[2]);
      case '-z':
        return Math.abs(hit[2] - min[2]);
      default:
        return Infinity;
    }
  })();
  if (distToChosenPlane <= planeEps) {
    return byPoint;
  }
  return {
    path: best.path,
    key: best.key,
    center: best.center,
    normal: best.normal,
    areaMm2: best.areaMm2,
  };
}

function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): { closest: Vec3; dist: number } {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const abLen2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t =
    abLen2 < 1e-18
      ? 0
      : Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / abLen2));
  const closest: Vec3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return { closest, dist: distanceMm(p, closest) };
}

/** Ensure snap helpers never invent triangle-index identity paths. */
export function assertSemanticFeaturePath(path: string): void {
  if (!path.startsWith('semantic:') || path.includes('/tri:') || path.includes('tri:')) {
    throw new Error('Measure features must be semantic: box paths, not triangle indices');
  }
  if (!path.includes('/box/')) {
    throw new Error(`Expected box feature path, got ${path}`);
  }
}

export { boxFeaturePath };
