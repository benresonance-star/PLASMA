import { describe, expect, it } from 'vitest';
import { createIcosahedron } from './icosahedron.js';
import { expectedGeodesicCounts, subdivideGeodesic } from './subdivide.js';
import {
  D01_TOPOLOGY_POLICY,
  assertD01TopologyInvariants,
  generateD01Topology,
  generateGoldbergTopology,
  hashTopology,
} from './d01.js';
import { adjacencySymmetric } from './goldberg.js';
import { createGoldbergTopologyOperator } from './operator.js';
import { TOLERANCE_POLICY_VERSION } from '@spds/shared-units';

describe('G4 geodesic / Goldberg topology', () => {
  it('builds a deterministic icosahedron index', () => {
    const a = createIcosahedron();
    const b = createIcosahedron();
    expect(a.vertices).toEqual(b.vertices);
    expect(a.faces).toEqual(b.faces);
    expect(a.vertices).toHaveLength(12);
    expect(a.faces).toHaveLength(20);
  });

  it('subdivides with predictable counts and projects to unit sphere', () => {
    const ico = createIcosahedron();
    for (const frequency of [1, 2, 3]) {
      const geo = subdivideGeodesic(ico.vertices, ico.faces, frequency);
      const expected = expectedGeodesicCounts(frequency);
      expect(geo.vertices.length).toBe(expected.vertices);
      expect(geo.faces.length).toBe(expected.faces);
      for (const v of geo.vertices) {
        const len = Math.hypot(v[0], v[1], v[2]);
        expect(Math.abs(len - 1)).toBeLessThan(1e-9);
      }
    }
  });

  it('produces valid Goldberg dual with 12 pentagons and symmetric adjacency', () => {
    const topo = generateGoldbergTopology({ frequency: 2, riseRatio: 1 });
    expect(topo.counts.pentagons).toBe(12);
    expect(topo.counts.hexagons).toBe(30);
    expect(adjacencySymmetric(topo)).toBe(true);
    expect(topo.counts.retainedCells + topo.counts.boundaryCells + topo.counts.excludedCells).toBe(
      topo.counts.cells,
    );
  });

  it('freezes D01 counts and hashes deterministically', async () => {
    const a = generateD01Topology();
    const b = generateD01Topology();
    assertD01TopologyInvariants(a);
    expect(a.counts.cells).toBe(D01_TOPOLOGY_POLICY.expectedClosed.cells);
    expect(hashTopology(a)).toBe(hashTopology(b));

    const op = createGoldbergTopologyOperator();
    const r1 = await op.execute(
      {
        frequency: D01_TOPOLOGY_POLICY.frequency,
        riseRatio: D01_TOPOLOGY_POLICY.riseRatio,
        diameterMm: D01_TOPOLOGY_POLICY.diameterMm,
      },
      { correlationId: 'c1', tolerancePolicyVersion: TOLERANCE_POLICY_VERSION },
    );
    const r2 = await op.execute(
      {
        frequency: D01_TOPOLOGY_POLICY.frequency,
        riseRatio: D01_TOPOLOGY_POLICY.riseRatio,
        diameterMm: D01_TOPOLOGY_POLICY.diameterMm,
      },
      { correlationId: 'c2', tolerancePolicyVersion: TOLERANCE_POLICY_VERSION },
    );
    expect(r1.outputHash).toBe(r2.outputHash);
  });

  it('classifies trim without orphan retained topology holes at rise=0.5', () => {
    const full = generateGoldbergTopology({ frequency: 2, riseRatio: 1 });
    const half = generateGoldbergTopology({ frequency: 2, riseRatio: 0.5 });
    expect(half.counts.excludedCells).toBeGreaterThan(0);
    expect(half.counts.retainedCells).toBeLessThan(full.counts.retainedCells);
  });
});
