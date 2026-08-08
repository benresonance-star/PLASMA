import { describe, expect, it } from 'vitest';
import { D01_TOPOLOGY_POLICY, generateD01Topology, generateGoldbergTopology } from './d01.js';
import {
  DEFAULT_Y_PROFILE,
  clearOpeningMm,
  extractYNetwork,
  validateYProfile,
} from './y-network.js';

describe('G5 Y semantic network', () => {
  it('extracts 3-valent Y junctions with inspectable frames for D01', () => {
    const topo = generateD01Topology();
    const network = extractYNetwork(topo, D01_TOPOLOGY_POLICY.diameterMm);
    expect(network.counts.junctions).toBeGreaterThan(0);
    expect(network.components.every((c) => c.valence === 3)).toBe(true);
    expect(network.components.every((c) => c.arms.length === 3)).toBe(true);
    expect(network.components.every((c) => c.id.startsWith('component:y:'))).toBe(true);
    expect(network.components.some((c) => c.frame.degenerate)).toBe(false);

    const again = extractYNetwork(topo, D01_TOPOLOGY_POLICY.diameterMm);
    expect(again.components.map((c) => c.id)).toEqual(network.components.map((c) => c.id));
  });

  it('skips excluded topology and validates Y profile parameters', () => {
    const full = extractYNetwork(
      generateGoldbergTopology({ frequency: 2, riseRatio: 1 }),
      D01_TOPOLOGY_POLICY.diameterMm,
    );
    const half = extractYNetwork(generateD01Topology(), D01_TOPOLOGY_POLICY.diameterMm);
    expect(half.counts.junctions).toBeLessThan(full.counts.junctions);
    expect(() => validateYProfile(DEFAULT_Y_PROFILE)).not.toThrow();
    expect(() =>
      validateYProfile({ ...DEFAULT_Y_PROFILE, apertureRatio: 1.2 }),
    ).toThrow(/apertureRatio/);
    expect(clearOpeningMm(DEFAULT_Y_PROFILE, 1000)).toBeGreaterThan(0);
  });
});
