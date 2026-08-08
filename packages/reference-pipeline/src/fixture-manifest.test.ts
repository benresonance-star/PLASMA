import { describe, expect, it } from 'vitest';
import { buildLiveReferenceCompletenessSuite } from './completeness.js';
import { loadFixtureManifests } from './fixture-manifest.js';

describe('E7 fixture manifest validation', () => {
  it('validates fixtures/*.json and matches live pipeline layers', async () => {
    const manifests = loadFixtureManifests();
    expect(manifests.map((m) => m.modelId).sort()).toEqual(['A01', 'D01', 'F01']);
    expect(manifests.every((m) => m.layers.includes('semantic') && m.layers.includes('pir'))).toBe(
      true,
    );
    expect(manifests.find((m) => m.modelId === 'F01')?.usesDomeImports).toBe(false);

    const live = await buildLiveReferenceCompletenessSuite();
    for (const m of manifests) {
      const row = live.find((r) => r.modelId === m.modelId);
      expect(row).toBeTruthy();
      expect([...row!.layers]).toEqual([...m.layers]);
    }
  });
});
