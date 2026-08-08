import { describe, expect, it } from 'vitest';
import { runGmshOrFallback } from './gmsh-runner.js';

describe('S2 live Gmsh path', () => {
  it('uses mock/fallback deterministically; live CLI/docker when available', () => {
    const mock = runGmshOrFallback({
      geometryArtifactHash: 'g:1',
      elementSizeMm: 20,
      algorithm: 'mock',
    });
    expect(mock.mode).toBe('deterministic-fallback');

    const live = runGmshOrFallback({
      geometryArtifactHash: 'g:2',
      elementSizeMm: 25,
      algorithm: 'frontal',
    });
    expect(['gmsh-cli', 'gmsh-docker', 'deterministic-fallback']).toContain(live.mode);
    expect(live.elementCount).toBeGreaterThan(0);
    expect(live.artifactHash).toHaveLength(64);

    // If docker/cli is up, prove we left fallback.
    if (process.env.SPDS_REQUIRE_LIVE_GMSH === '1') {
      expect(live.mode).not.toBe('deterministic-fallback');
    }
  }, 180_000);
});
