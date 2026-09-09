import type { GeometryCompileMesh } from './compile.js';

/** Matches DEFAULT_TOLERANCE_POLICY.familyClusteringLengthMm (shared-units) for dual display. */
const DEFAULT_DUAL_EXTENT_TOLERANCE_MM = 3;

export interface MeshAabb {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly extentsMm: readonly [number, number, number];
  readonly diagonalMm: number;
}

/** Axis-aligned bounding box from a compile mesh (display buffer). */
export function meshAabb(mesh: Pick<GeometryCompileMesh, 'vertices'>): MeshAabb {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const v of mesh.vertices) {
    const x = v[0]!;
    const y = v[1]!;
    const z = v[2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      extentsMm: [0, 0, 0],
      diagonalMm: 0,
    };
  }
  const extentsMm: [number, number, number] = [maxX - minX, maxY - minY, maxZ - minZ];
  const diagonalMm = Math.hypot(extentsMm[0], extentsMm[1], extentsMm[2]);
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    extentsMm,
    diagonalMm,
  };
}

export interface DualMeshCompareResult {
  readonly ok: boolean;
  readonly ownersMatch: boolean;
  readonly maxExtentDeltaMm: number;
  readonly diagonalDeltaMm: number;
  readonly reason?: string;
}

/**
 * Compare exact vs OCCT meshes for owner alignment and AABB drift (D2-class).
 * Uses family clustering length as the dual-kernel display tolerance.
 */
export function compareDualMeshExtents(
  exact: readonly GeometryCompileMesh[],
  occt: readonly GeometryCompileMesh[],
  toleranceMm: number = DEFAULT_DUAL_EXTENT_TOLERANCE_MM,
): DualMeshCompareResult {
  const exactOwners = exact.map((m) => m.semanticOwner).sort();
  const occtOwners = occt.map((m) => m.semanticOwner).sort();
  const ownersMatch =
    exactOwners.length === occtOwners.length &&
    exactOwners.every((o, i) => o === occtOwners[i]);
  if (!ownersMatch) {
    return {
      ok: false,
      ownersMatch: false,
      maxExtentDeltaMm: Infinity,
      diagonalDeltaMm: Infinity,
      reason: 'OWNER_MISMATCH',
    };
  }

  let maxExtentDeltaMm = 0;
  let diagonalDeltaMm = 0;
  for (const e of exact) {
    const o = occt.find((m) => m.semanticOwner === e.semanticOwner);
    if (!o) {
      return {
        ok: false,
        ownersMatch: false,
        maxExtentDeltaMm: Infinity,
        diagonalDeltaMm: Infinity,
        reason: 'OWNER_MISMATCH',
      };
    }
    const a = meshAabb(e);
    const b = meshAabb(o);
    for (let i = 0; i < 3; i++) {
      maxExtentDeltaMm = Math.max(maxExtentDeltaMm, Math.abs(a.extentsMm[i]! - b.extentsMm[i]!));
    }
    diagonalDeltaMm = Math.max(diagonalDeltaMm, Math.abs(a.diagonalMm - b.diagonalMm));
  }

  if (maxExtentDeltaMm > toleranceMm) {
    return {
      ok: false,
      ownersMatch: true,
      maxExtentDeltaMm,
      diagonalDeltaMm,
      reason: 'EXTENT_DRIFT',
    };
  }
  return { ok: true, ownersMatch: true, maxExtentDeltaMm, diagonalDeltaMm };
}

/** Domain check for proposed lengthMm against fabrication bounds. */
export function validateLengthMmInDomain(
  lengthMm: number,
  minMm: number,
  maxMm: number,
): { readonly ok: boolean; readonly reason?: string } {
  if (!Number.isFinite(lengthMm)) {
    return { ok: false, reason: 'LENGTH_NOT_FINITE' };
  }
  if (lengthMm < minMm || lengthMm > maxMm) {
    return { ok: false, reason: 'LENGTH_OUT_OF_RANGE' };
  }
  return { ok: true };
}

export interface DualMeasureValidation {
  readonly ok: boolean;
  readonly lengthOk: boolean;
  readonly dualOk: boolean;
  readonly reason?: string;
}

/**
 * K4.2 — validate proposed length domain + dual-kernel extents on compile meshes
 * (exact + OCCT when present), not demo boxes.
 */
export function validateProposalDualMeasure(input: {
  readonly lengthMm: number;
  readonly minMm: number;
  readonly maxMm: number;
  readonly exactMeshes: readonly GeometryCompileMesh[];
  readonly occtMeshes?: readonly GeometryCompileMesh[];
  readonly extentToleranceMm?: number;
}): DualMeasureValidation {
  const length = validateLengthMmInDomain(input.lengthMm, input.minMm, input.maxMm);
  if (!length.ok) {
    return {
      ok: false,
      lengthOk: false,
      dualOk: false,
      reason: length.reason ?? 'LENGTH_OUT_OF_RANGE',
    };
  }
  if (!input.occtMeshes || input.occtMeshes.length === 0) {
    return {
      ok: true,
      lengthOk: true,
      dualOk: false,
      reason: 'OCCT_MESHES_ABSENT',
    };
  }
  const dual = compareDualMeshExtents(
    input.exactMeshes,
    input.occtMeshes,
    input.extentToleranceMm,
  );
  return {
    ok: dual.ok,
    lengthOk: true,
    dualOk: dual.ok,
    ...(dual.reason !== undefined ? { reason: dual.reason } : {}),
  };
}
