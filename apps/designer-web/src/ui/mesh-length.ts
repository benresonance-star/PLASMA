import type { DisplayMeshInput } from '../mesh-bridge.js';

type Vec3 = readonly [number, number, number];

/** Dominant axis via power iteration on point covariance (arm length ≫ section). */
function dominantAxis(vertices: readonly Vec3[]): Vec3 {
  const n = vertices.length;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const v of vertices) {
    cx += v[0];
    cy += v[1];
    cz += v[2];
  }
  cx /= n;
  cy /= n;
  cz /= n;

  let ax = 1;
  let ay = 0;
  let az = 0;
  for (let iter = 0; iter < 12; iter++) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const v of vertices) {
      const dx = v[0] - cx;
      const dy = v[1] - cy;
      const dz = v[2] - cz;
      const dot = dx * ax + dy * ay + dz * az;
      sx += dot * dx;
      sy += dot * dy;
      sz += dot * dz;
    }
    const len = Math.hypot(sx, sy, sz) || 1;
    ax = sx / len;
    ay = sy / len;
    az = sz / len;
  }
  return [ax, ay, az];
}

/**
 * Scale each mesh along its primary arm axis, keeping cross-section size.
 * Used for live D01 length preview without recompile.
 */
export function scaleArmMeshes(
  meshes: readonly DisplayMeshInput[],
  factor: number,
): readonly DisplayMeshInput[] {
  if (!Number.isFinite(factor) || factor <= 0) return meshes;
  return meshes.map((m) => {
    if (m.vertices.length < 2) return m;
    const [ux, uy, uz] = dominantAxis(m.vertices);

    let minProj = Infinity;
    let origin: Vec3 = m.vertices[0]!;
    for (const v of m.vertices) {
      const proj = v[0] * ux + v[1] * uy + v[2] * uz;
      if (proj < minProj) {
        minProj = proj;
        origin = v;
      }
    }

    return {
      ...m,
      vertices: m.vertices.map((v) => {
        const dx = v[0] - origin[0];
        const dy = v[1] - origin[1];
        const dz = v[2] - origin[2];
        const along = dx * ux + dy * uy + dz * uz;
        const px = dx - ux * along;
        const py = dy - uy * along;
        const pz = dz - uz * along;
        return [
          origin[0] + ux * along * factor + px,
          origin[1] + uy * along * factor + py,
          origin[2] + uz * along * factor + pz,
        ] as const;
      }),
    };
  });
}
