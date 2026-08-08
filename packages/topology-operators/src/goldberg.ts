import type { Vec3 } from './vec3.js';
import { cross, normalize, sub } from './vec3.js';

export type TrimClass = 'retained' | 'boundary' | 'excluded';

export interface TopologyVertex {
  readonly id: string;
  readonly index: number;
  readonly position: Vec3;
}

export interface TopologyEdge {
  readonly id: string;
  readonly a: number;
  readonly b: number;
}

export interface TopologyCell {
  readonly id: string;
  readonly index: number;
  readonly cellType: 'pentagon' | 'hexagon';
  readonly vertexIndex: number;
  readonly neighborVertexIndices: readonly number[];
  readonly trim: TrimClass;
}

export interface GoldbergTopology {
  readonly frequency: number;
  readonly geodesicClass: 'I';
  readonly vertices: readonly TopologyVertex[];
  readonly edges: readonly TopologyEdge[];
  readonly cells: readonly TopologyCell[];
  readonly counts: {
    readonly vertices: number;
    readonly edges: number;
    readonly cells: number;
    readonly pentagons: number;
    readonly hexagons: number;
    readonly retainedCells: number;
    readonly boundaryCells: number;
    readonly excludedCells: number;
  };
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function buildGoldbergFromGeodesic(
  positions: readonly Vec3[],
  faces: readonly (readonly [number, number, number])[],
  frequency: number,
  options: { riseRatio: number },
): GoldbergTopology {
  const neighbors = new Map<number, Set<number>>();
  const edgeSet = new Map<string, TopologyEdge>();

  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    const key = edgeKey(a, b);
    if (!edgeSet.has(key)) {
      edgeSet.set(key, {
        id: `edge:g:${key}`,
        a: Math.min(a, b),
        b: Math.max(a, b),
      });
    }
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
  };

  for (const face of faces) {
    addEdge(face[0], face[1]);
    addEdge(face[1], face[2]);
    addEdge(face[2], face[0]);
  }

  const vertices: TopologyVertex[] = positions.map((position, index) => ({
    id: `vertex:g:${String(index).padStart(4, '0')}`,
    index,
    position,
  }));

  const zValues = positions.map((p) => p[2]);
  const zMin = Math.min(...zValues);
  const zMax = Math.max(...zValues);
  const rise = Math.min(1, Math.max(0, options.riseRatio));
  const cutZ = zMax - rise * (zMax - zMin);
  const boundaryBand = (zMax - zMin) * 0.02;

  const cells: TopologyCell[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    const nbrs = [...(neighbors.get(i) ?? [])].sort((a, b) => a - b);
    const ordered = orderNeighborsAround(positions[i]!, nbrs, positions);
    const cellType = ordered.length === 5 ? 'pentagon' : 'hexagon';
    const z = positions[i]![2];
    let trim: TrimClass = 'retained';
    if (z < cutZ - boundaryBand) trim = 'excluded';
    else if (z < cutZ + boundaryBand) trim = 'boundary';
    cells.push({
      id: `cell:g:${String(i).padStart(4, '0')}`,
      index: i,
      cellType,
      vertexIndex: i,
      neighborVertexIndices: ordered,
      trim,
    });
  }

  const pentagons = cells.filter((c) => c.cellType === 'pentagon').length;
  const hexagons = cells.filter((c) => c.cellType === 'hexagon').length;

  return {
    frequency,
    geodesicClass: 'I',
    vertices,
    edges: [...edgeSet.values()].sort((a, b) => a.id.localeCompare(b.id)),
    cells,
    counts: {
      vertices: vertices.length,
      edges: edgeSet.size,
      cells: cells.length,
      pentagons,
      hexagons,
      retainedCells: cells.filter((c) => c.trim === 'retained').length,
      boundaryCells: cells.filter((c) => c.trim === 'boundary').length,
      excludedCells: cells.filter((c) => c.trim === 'excluded').length,
    },
  };
}

function orderNeighborsAround(
  center: Vec3,
  neighborIndices: readonly number[],
  positions: readonly Vec3[],
): number[] {
  if (neighborIndices.length === 0) return [];
  const normal = normalize(center);
  const helper: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const tangent = normalize(cross(helper, normal));
  const bitangent = normalize(cross(normal, tangent));
  return [...neighborIndices].sort((ia, ib) => {
    const a = sub(positions[ia]!, center);
    const b = sub(positions[ib]!, center);
    const angA = Math.atan2(dot3(a, bitangent), dot3(a, tangent));
    const angB = Math.atan2(dot3(b, bitangent), dot3(b, tangent));
    return angA - angB;
  });
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function adjacencySymmetric(topo: GoldbergTopology): boolean {
  const cellByVertex = new Map(topo.cells.map((c) => [c.vertexIndex, c]));
  for (const cell of topo.cells) {
    for (const n of cell.neighborVertexIndices) {
      const other = cellByVertex.get(n);
      if (!other?.neighborVertexIndices.includes(cell.vertexIndex)) return false;
    }
  }
  return true;
}
