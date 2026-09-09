import type { GeometryTopologyElement } from './dto.js';
import {
  triangulatePlanarProfile,
  type ExtrusionVec3,
} from './extrusion-mesh.js';

function padded(index: number): string {
  return String(index).padStart(4, '0');
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

function cleanedProfiles(
  profiles: readonly (readonly ExtrusionVec3[])[],
): readonly (readonly ExtrusionVec3[])[] {
  const cleaned = profiles.map(
    (profile) => triangulatePlanarProfile(profile).points,
  );
  const count = cleaned[0]?.length;
  if (
    count === undefined ||
    cleaned.some((profile) => profile.length !== count)
  ) {
    throw new Error('Loft topology requires matching profile vertex counts');
  }
  return cleaned;
}

interface LoftTopologyInput {
  readonly semanticOwner: string;
  readonly featurePath: string;
  readonly profiles: readonly (readonly ExtrusionVec3[])[];
}

export function loftEdgeTopology(
  input: LoftTopologyInput,
): readonly GeometryTopologyElement[] {
  const profiles = cleanedProfiles(input.profiles);
  const count = profiles[0]!.length;
  const elements: GeometryTopologyElement[] = [];
  for (let section = 0; section < profiles.length; section += 1) {
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      elements.push({
        path: `${input.semanticOwner}/${input.featurePath}/edge:profile:${padded(section)}:${padded(index)}`,
        kind: 'edge',
        boundsMm: pointsBounds([
          profiles[section]![index]!,
          profiles[section]![next]!,
        ]),
        source: { role: `profile:${padded(section)}`, index },
      });
    }
  }
  for (let interval = 0; interval < profiles.length - 1; interval += 1) {
    for (let index = 0; index < count; index += 1) {
      elements.push({
        path: `${input.semanticOwner}/${input.featurePath}/edge:rail:${padded(interval)}:${padded(index)}`,
        kind: 'edge',
        boundsMm: pointsBounds([
          profiles[interval]![index]!,
          profiles[interval + 1]![index]!,
        ]),
        source: { role: `rail:${padded(interval)}`, index },
      });
    }
  }
  return elements;
}

export function loftFaceTopology(
  input: LoftTopologyInput,
): readonly GeometryTopologyElement[] {
  const profiles = cleanedProfiles(input.profiles);
  const count = profiles[0]!.length;
  const elements: GeometryTopologyElement[] = [
    {
      path: `${input.semanticOwner}/${input.featurePath}/face:profile-start`,
      kind: 'face',
      boundsMm: pointsBounds(profiles[0]!),
      source: { role: 'profile-start', index: 0 },
    },
    {
      path: `${input.semanticOwner}/${input.featurePath}/face:profile-end`,
      kind: 'face',
      boundsMm: pointsBounds(profiles[profiles.length - 1]!),
      source: { role: 'profile-end', index: profiles.length - 1 },
    },
  ];
  for (let interval = 0; interval < profiles.length - 1; interval += 1) {
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      elements.push({
        path: `${input.semanticOwner}/${input.featurePath}/face:side:${padded(interval)}:${padded(index)}`,
        kind: 'face',
        boundsMm: pointsBounds([
          profiles[interval]![index]!,
          profiles[interval]![next]!,
          profiles[interval + 1]![next]!,
          profiles[interval + 1]![index]!,
        ]),
        source: { role: `side:${padded(interval)}`, index },
      });
    }
  }
  return elements;
}
