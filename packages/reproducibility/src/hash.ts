import { createHash } from 'node:crypto';

/** Canonical JSON stringify with sorted object keys for D0 hashing. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}
