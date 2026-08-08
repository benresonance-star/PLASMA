import type { Vec3 } from './vec3.js';
import { add, cross, length, normalize, scale, sub } from './vec3.js';
import type { GoldbergTopology, TrimClass } from './goldberg.js';
import { createIcosahedron } from './icosahedron.js';
import { subdivideGeodesic } from './subdivide.js';

export interface LocalFrame {
  readonly origin: Vec3;
  readonly normal: Vec3;
  readonly tangent: Vec3;
  readonly bitangent: Vec3;
  readonly degenerate: boolean;
}

export interface YArm {
  readonly id: string;
  readonly neighborJunctionIndex: number;
  readonly sharedPrimalEdge: readonly [number, number];
  readonly lengthMmPlaceholder: number;
}

export interface YComponent {
  readonly id: string;
  readonly junctionIndex: number;
  readonly faceVertexIndices: readonly [number, number, number];
  readonly frame: LocalFrame;
  readonly arms: readonly YArm[];
  readonly valence: 3;
  readonly trim: TrimClass;
}

export interface YProfileParameters {
  readonly structuralDepthMm: number;
  readonly armWidthMm: number;
  readonly wallThicknessMm: number;
  readonly apertureRatio: number;
}

export interface YNetwork {
  readonly components: readonly YComponent[];
  readonly profile: YProfileParameters;
  readonly counts: {
    readonly junctions: number;
    readonly retained: number;
    readonly boundary: number;
    readonly excluded: number;
  };
}

export const DEFAULT_Y_PROFILE: YProfileParameters = {
  structuralDepthMm: 180,
  armWidthMm: 60,
  wallThicknessMm: 8,
  apertureRatio: 0.65,
};

export function computeLocalFrame(origin: Vec3, armTargets: readonly Vec3[]): LocalFrame {
  const normal = normalize(origin);
  if (armTargets.length < 2) {
    return {
      origin,
      normal,
      tangent: [1, 0, 0],
      bitangent: [0, 1, 0],
      degenerate: true,
    };
  }
  const t0 = normalize(sub(armTargets[0]!, origin));
  const projected = sub(
    t0,
    scale(normal, t0[0] * normal[0] + t0[1] * normal[1] + t0[2] * normal[2]),
  );
  let tangent = normalize(projected);
  if (length(tangent) < 1e-9) {
    const helper: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    tangent = normalize(cross(helper, normal));
  }
  const bitangent = normalize(cross(normal, tangent));
  return {
    origin,
    normal,
    tangent,
    bitangent,
    degenerate: length(bitangent) < 1e-9,
  };
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Extract 3-valent Y junctions from geodesic faces (dual vertices of Goldberg).
 * Semantic-only: no Three.js / kernel geometry.
 */
export function extractYNetwork(
  topo: GoldbergTopology,
  diameterMm: number,
  profile: YProfileParameters = DEFAULT_Y_PROFILE,
): YNetwork {
  const ico = createIcosahedron();
  const geo = subdivideGeodesic(ico.vertices, ico.faces, topo.frequency);
  const radiusMm = diameterMm / 2;

  const faceCentroids: Vec3[] = geo.faces.map((face) =>
    normalize(
      add(
        add(geo.vertices[face[0]]!, geo.vertices[face[1]]!),
        geo.vertices[face[2]]!,
      ),
    ),
  );

  // Map primal edge -> faces that use it
  const edgeToFaces = new Map<string, number[]>();
  geo.faces.forEach((face, faceIndex) => {
    const edges: Array<[number, number]> = [
      [face[0], face[1]],
      [face[1], face[2]],
      [face[2], face[0]],
    ];
    for (const [a, b] of edges) {
      const key = edgeKey(a, b);
      const list = edgeToFaces.get(key) ?? [];
      list.push(faceIndex);
      edgeToFaces.set(key, list);
    }
  });

  const cellTrim = new Map(topo.cells.map((c) => [c.vertexIndex, c.trim]));
  const components: YComponent[] = [];

  for (let faceIndex = 0; faceIndex < geo.faces.length; faceIndex += 1) {
    const face = geo.faces[faceIndex]!;
    const trimVotes: TrimClass[] = [face[0], face[1], face[2]].map(
      (v) => cellTrim.get(v) ?? 'excluded',
    );
    const trim: TrimClass = trimVotes.includes('retained')
      ? trimVotes.every((t) => t === 'retained')
        ? 'retained'
        : 'boundary'
      : trimVotes.includes('boundary')
        ? 'boundary'
        : 'excluded';

    if (trim === 'excluded') continue;

    const originUnit = faceCentroids[faceIndex]!;
    const origin = scale(originUnit, radiusMm);
    const arms: YArm[] = [];
    const armTargets: Vec3[] = [];
    const faceEdges: Array<[number, number]> = [
      [face[0], face[1]],
      [face[1], face[2]],
      [face[2], face[0]],
    ];

    for (const [a, b] of faceEdges) {
      const key = edgeKey(a, b);
      const faces = edgeToFaces.get(key) ?? [];
      const neighbor = faces.find((f) => f !== faceIndex);
      if (neighbor === undefined) continue;
      const target = scale(faceCentroids[neighbor]!, radiusMm);
      armTargets.push(target);
      arms.push({
        id: `arm:y:${String(faceIndex).padStart(4, '0')}:${arms.length}`,
        neighborJunctionIndex: neighbor,
        sharedPrimalEdge: a < b ? [a, b] : [b, a],
        lengthMmPlaceholder: length(sub(target, origin)) * profile.apertureRatio,
      });
    }

    if (arms.length !== 3) continue;

    components.push({
      id: `component:y:${String(faceIndex).padStart(4, '0')}`,
      junctionIndex: faceIndex,
      faceVertexIndices: face,
      frame: computeLocalFrame(origin, armTargets),
      arms,
      valence: 3,
      trim,
    });
  }

  components.sort((a, b) => a.id.localeCompare(b.id));

  return {
    components,
    profile,
    counts: {
      junctions: components.length,
      retained: components.filter((c) => c.trim === 'retained').length,
      boundary: components.filter((c) => c.trim === 'boundary').length,
      excluded: geo.faces.length - components.length,
    },
  };
}

export function validateYProfile(profile: YProfileParameters): void {
  if (!(profile.structuralDepthMm > 0)) throw new Error('structuralDepthMm must be positive');
  if (!(profile.armWidthMm > 0)) throw new Error('armWidthMm must be positive');
  if (!(profile.wallThicknessMm > 0)) throw new Error('wallThicknessMm must be positive');
  if (!(profile.apertureRatio > 0 && profile.apertureRatio < 1)) {
    throw new Error('apertureRatio must be in (0,1)');
  }
  if (profile.wallThicknessMm * 2 >= profile.armWidthMm) {
    throw new Error('wallThickness too large for armWidth');
  }
}

export function clearOpeningMm(profile: YProfileParameters, armLengthMm: number): number {
  return armLengthMm * profile.apertureRatio - profile.wallThicknessMm;
}
