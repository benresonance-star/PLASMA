import { describe, expect, it } from 'vitest';
import {
  assessReproducibility,
  createDesignRelease,
  gcDryRun,
  publishRelease,
  validateRelease,
} from './index.js';

describe('G12A release-core', () => {
  const manifest = {
    compilerVersion: '1.0.0',
    operatorVersions: { 'y-network': '1.0.0' },
    tolerancePolicyVersion: 'tol-1',
    determinismClass: 'D1' as const,
    artifactHashes: ['abc'],
  };

  it('validates and publishes DesignRelease with reproducibility status', () => {
    let release = createDesignRelease({ snapshotId: 'snap:1', manifest });
    release = validateRelease(release);
    release = publishRelease(release);
    expect(release.status).toBe('published');
    expect(assessReproducibility(manifest, manifest)).toBe('exact');
    expect(
      assessReproducibility(manifest, { ...manifest, compilerVersion: '2.0.0', operatorVersions: {} }),
    ).toBe('not-reproducible');
  });

  it('protects fabrication-release artifacts from GC', () => {
    const result = gcDryRun({
      artifacts: [
        { hash: 'keep', releaseProtected: true },
        { hash: 'gone', releaseProtected: false },
      ],
      orphanHashes: ['keep', 'gone', 'orphan'],
    });
    expect(result.wouldDelete).toEqual(['gone', 'orphan']);
    expect(result.protected).toContain('keep');
  });
});
