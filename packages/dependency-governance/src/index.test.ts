import { describe, expect, it } from 'vitest';
import { assertLicenseKnown } from './index.js';

describe('@spds/dependency-governance', () => {
  it('accepts known licence strings', () => {
    expect(() => assertLicenseKnown('MIT')).not.toThrow();
    expect(() => assertLicenseKnown('Apache-2.0')).not.toThrow();
  });

  it('rejects unknown or prohibited classifications', () => {
    expect(() => assertLicenseKnown('unknown')).toThrow(/licence/i);
    expect(() => assertLicenseKnown('prohibited')).toThrow(/licence/i);
    expect(() => assertLicenseKnown('  ')).toThrow(/licence/i);
  });
});
