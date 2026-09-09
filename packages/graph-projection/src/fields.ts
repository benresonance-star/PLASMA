/** Field influence dual-selection + deterministic 64×64 sample grid (SD6.1 / E1a). */

export const FIELD_GRID_SIZE = 64;

export interface FieldInfluenceOverlay {
  readonly fieldId: string;
  readonly sampleGridSize: number;
  readonly width: number;
  readonly height: number;
  /** Row-major scalars in [0, 1]; length === width * height. */
  readonly values: readonly number[];
  /** Owners influenced by this field (geometry highlight targets). */
  readonly influenceIds: readonly string[];
}

export interface FieldInfluenceProjection {
  readonly primaryId: string;
  readonly secondaryIds: readonly string[];
  readonly overlay: FieldInfluenceOverlay;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unitNoise(seed: number, x: number, y: number): number {
  const n = Math.sin(seed * 0.0001 + x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** Deterministic 64×64 influence field; values finite and stable for a given fieldId. */
export function projectFieldInfluence(
  fieldId: string,
  affectedOwnerIds: readonly string[],
): FieldInfluenceProjection {
  const width = FIELD_GRID_SIZE;
  const height = FIELD_GRID_SIZE;
  const seed = hashString(fieldId);
  const values = new Array<number>(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / (width - 1);
      const ny = y / (height - 1);
      const radial = Math.hypot(nx - 0.5, ny - 0.5);
      const falloff = Math.max(0, 1 - radial * 1.6);
      const ripple = 0.35 * Math.sin((nx + ny) * Math.PI * 4 + (seed % 97) * 0.01);
      const noise = 0.15 * unitNoise(seed, x, y);
      const v = Math.min(1, Math.max(0, falloff * 0.75 + ripple * falloff + noise * falloff));
      values[y * width + x] = v;
    }
  }
  const influenceIds = [...new Set(affectedOwnerIds)].sort();
  return {
    primaryId: fieldId,
    secondaryIds: influenceIds,
    overlay: {
      fieldId,
      sampleGridSize: FIELD_GRID_SIZE,
      width,
      height,
      values,
      influenceIds,
    },
  };
}
