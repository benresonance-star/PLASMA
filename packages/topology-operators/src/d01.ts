import { sha256Canonical } from '@spds/reproducibility';
import { createIcosahedron } from './icosahedron.js';
import { expectedGeodesicCounts, subdivideGeodesic } from './subdivide.js';
import { adjacencySymmetric, buildGoldbergFromGeodesic, type GoldbergTopology } from './goldberg.js';

/**
 * D01 frozen topology policy (G4.2 / G4.5).
 * Class-I geodesic frequency 2 → closed Goldberg with 42 cells (12 pent + 30 hex).
 */
export const D01_TOPOLOGY_POLICY = {
  model: 'D01',
  geodesicClass: 'I' as const,
  frequency: 2,
  diameterMm: 20000,
  riseRatio: 0.5,
  expectedClosed: {
    vertices: 42,
    faces: 80,
    edges: 120,
    cells: 42,
    pentagons: 12,
    hexagons: 30,
  },
} as const;

export function generateGoldbergTopology(input: {
  frequency: number;
  riseRatio: number;
}): GoldbergTopology {
  const ico = createIcosahedron();
  const geo = subdivideGeodesic(ico.vertices, ico.faces, input.frequency);
  return buildGoldbergFromGeodesic(geo.vertices, geo.faces, input.frequency, {
    riseRatio: input.riseRatio,
  });
}

export function generateD01Topology(): GoldbergTopology {
  return generateGoldbergTopology({
    frequency: D01_TOPOLOGY_POLICY.frequency,
    riseRatio: D01_TOPOLOGY_POLICY.riseRatio,
  });
}

export function assertD01TopologyInvariants(topo: GoldbergTopology): void {
  const expected = expectedGeodesicCounts(D01_TOPOLOGY_POLICY.frequency);
  if (topo.frequency !== D01_TOPOLOGY_POLICY.frequency) {
    throw new Error('D01 frequency mismatch');
  }
  if (topo.counts.vertices !== expected.vertices) {
    throw new Error(`vertex count ${topo.counts.vertices} != ${expected.vertices}`);
  }
  if (topo.counts.cells !== D01_TOPOLOGY_POLICY.expectedClosed.cells) {
    throw new Error(`cell count ${topo.counts.cells} != frozen`);
  }
  if (topo.counts.pentagons !== 12) {
    throw new Error(`pentagon count ${topo.counts.pentagons} != 12`);
  }
  if (topo.counts.hexagons !== D01_TOPOLOGY_POLICY.expectedClosed.hexagons) {
    throw new Error(`hexagon count mismatch`);
  }
  if (!adjacencySymmetric(topo)) {
    throw new Error('adjacency not symmetric');
  }
  const ids = new Set<string>();
  for (const obj of [...topo.vertices, ...topo.edges, ...topo.cells]) {
    if (ids.has(obj.id)) throw new Error(`duplicate id ${obj.id}`);
    ids.add(obj.id);
  }
  const orphans = topo.cells.filter(
    (c) => c.trim === 'excluded' && c.neighborVertexIndices.length === 0,
  );
  if (orphans.length > 0) throw new Error('orphan excluded cells without neighbors');
}

export function hashTopology(topo: GoldbergTopology): string {
  return sha256Canonical({
    frequency: topo.frequency,
    geodesicClass: topo.geodesicClass,
    counts: topo.counts,
    cellIds: topo.cells.map((c) => c.id),
    vertexIds: topo.vertices.map((v) => v.id),
    edgeIds: topo.edges.map((e) => e.id),
  });
}
