import type { GraphProjection } from './types.js';

export type ProjectionCacheKey = {
  readonly modelVersion: string;
  readonly focusIds: readonly string[];
  readonly radius: number;
  readonly depth: string;
  readonly lenses: readonly string[];
};

function keyOf(k: ProjectionCacheKey): string {
  return [
    k.modelVersion,
    [...k.focusIds].sort().join(','),
    String(k.radius),
    k.depth,
    [...k.lenses].sort().join('+'),
  ].join('|');
}

export function createProjectionCache(): {
  get: (k: ProjectionCacheKey) => GraphProjection | undefined;
  set: (k: ProjectionCacheKey, value: GraphProjection) => void;
  invalidate: (modelVersion: string) => void;
  stats: () => { hits: number; misses: number; size: number };
} {
  const map = new Map<string, GraphProjection>();
  let hits = 0;
  let misses = 0;
  return {
    get(k) {
      const v = map.get(keyOf(k));
      if (v) {
        hits += 1;
        return v;
      }
      misses += 1;
      return undefined;
    },
    set(k, value) {
      map.set(keyOf(k), value);
    },
    invalidate(modelVersion) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(`${modelVersion}|`)) map.delete(key);
      }
    },
    stats: () => ({ hits, misses, size: map.size }),
  };
}
