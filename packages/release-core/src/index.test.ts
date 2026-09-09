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

  it('accepts dual-kernel compile hashes on manifest', () => {
    const dual = {
      ...manifest,
      compileHash: 'a'.repeat(64),
      pirHash: 'pir:1',
      dagHash: 'dag:1',
      kernelArtifactHashes: {
        exact: ['exact-hash'],
        occtNote: 'OCCT hashes omitted — dual-kernel publish did not attach OCCT STEP/mesh hashes',
      },
    };
    const release = createDesignRelease({ snapshotId: 'snap:dual', manifest: dual });
    expect(release.manifest.compileHash).toHaveLength(64);
    expect(release.manifest.kernelArtifactHashes?.exact).toEqual(['exact-hash']);
    expect(release.manifest.kernelArtifactHashes?.occtNote).toMatch(/OCCT hashes omitted/);
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
