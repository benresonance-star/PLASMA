import { describe, expect, it } from 'vitest';
import { canonicalize, sha256Canonical } from './index.js';

describe('@spds/reproducibility', () => {
  it('canonicalizes object key order for stable hashes', () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(sha256Canonical({ b: 1, a: 2 })).toBe(sha256Canonical({ a: 2, b: 1 }));
  });
});
