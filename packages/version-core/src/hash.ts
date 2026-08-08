import { sha256Canonical } from '@spds/reproducibility';

export function hashState(state: unknown): string {
  return sha256Canonical(state);
}
