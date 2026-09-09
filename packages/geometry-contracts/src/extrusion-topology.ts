import type { GeometryTopologyElement } from './dto.js';
import type { ExtrusionVec3 } from './extrusion-mesh.js';

type Vec3 = [number, number, number];

function offset(point: ExtrusionVec3, vector: ExtrusionVec3): Vec3 {
  return [
    point[0] + vector[0],
    point[1] + vector[1],
    point[2] + vector[2],
  ];
}

function edgeBounds(
  a: ExtrusionVec3,
  b: ExtrusionVec3,
): GeometryTopologyElement['boundsMm'] {
  return {
    min: [
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.min(a[2], b[2]),
    ],
    max: [
      Math.max(a[0], b[0]),
      Math.max(a[1], b[1]),
      Math.max(a[2], b[2]),
    ],
  };
}

function pointsBounds(
  points: readonly ExtrusionVec3[],
): GeometryTopologyElement['boundsMm'] {
  return {
    min: [
      Math.min(...points.map((point) => point[0])),
      Math.min(...points.map((point) => point[1])),
      Math.min(...points.map((point) => point[2])),
    ],
    max: [
      Math.max(...points.map((point) => point[0])),
      Math.max(...points.map((point) => point[1])),
      Math.max(...points.map((point) => point[2])),
    ],
  };
}

function edgePath(
  semanticOwner: string,
  featurePath: string,
  role: string,
  index: number,
): string {
  return `${semanticOwner}/${featurePath}/edge:${role}:${String(index).padStart(4, '0')}`;
}

export function extrusionEdgeTopology(input: {
  readonly semanticOwner: string;
  readonly featurePath: string;
  readonly profile: readonly ExtrusionVec3[];
  readonly vector: ExtrusionVec3;
}): readonly GeometryTopologyElement[] {
  const elements: GeometryTopologyElement[] = [];
  for (let index = 0; index < input.profile.length; index += 1) {
    const next = (index + 1) % input.profile.length;
    const startA = input.profile[index]!;
    const startB = input.profile[next]!;
    const endA = offset(startA, input.vector);
    const endB = offset(startB, input.vector);
    elements.push(
      {
        path: edgePath(
          input.semanticOwner,
          input.featurePath,
          'profile-start',
          index,
        ),
        kind: 'edge',
        boundsMm: edgeBounds(startA, startB),
        source: { role: 'profile-start', index },
      },
      {
        path: edgePath(
          input.semanticOwner,
          input.featurePath,
          'profile-end',
          index,
        ),
        kind: 'edge',
        boundsMm: edgeBounds(endA, endB),
        source: { role: 'profile-end', index },
      },
      {
        path: edgePath(input.semanticOwner, input.featurePath, 'rail', index),
        kind: 'edge',
        boundsMm: edgeBounds(startA, endA),
        source: { role: 'rail', index },
      },
    );
  }
  return elements;
}

export function extrusionFaceTopology(input: {
  readonly semanticOwner: string;
  readonly featurePath: string;
  readonly profile: readonly ExtrusionVec3[];
  readonly vector: ExtrusionVec3;
}): readonly GeometryTopologyElement[] {
  const endProfile = input.profile.map((point) => offset(point, input.vector));
  const elements: GeometryTopologyElement[] = [
    {
      path: `${input.semanticOwner}/${input.featurePath}/face:profile-start`,
      kind: 'face',
      boundsMm: pointsBounds(input.profile),
      source: { role: 'profile-start', index: 0 },
    },
    {
      path: `${input.semanticOwner}/${input.featurePath}/face:profile-end`,
      kind: 'face',
      boundsMm: pointsBounds(endProfile),
      source: { role: 'profile-end', index: 0 },
    },
  ];
  for (let index = 0; index < input.profile.length; index += 1) {
    const next = (index + 1) % input.profile.length;
    elements.push({
      path: `${input.semanticOwner}/${input.featurePath}/face:side:${String(index).padStart(4, '0')}`,
      kind: 'face',
      boundsMm: pointsBounds([
        input.profile[index]!,
        input.profile[next]!,
        endProfile[next]!,
        endProfile[index]!,
      ]),
      source: { role: 'side', index },
    });
  }
  return elements;
}
