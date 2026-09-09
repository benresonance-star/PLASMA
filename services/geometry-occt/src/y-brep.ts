import type { GeometryRepresentation } from '@spds/geometry-contracts';
import {
  D01_TOPOLOGY_POLICY,
  deriveYComponentArmSegments,
  extractYNetwork,
  generateD01Topology,
  type YComponent,
} from '@spds/topology-operators';
import type { GeometryKernel } from './kernel-factory.js';

export function generateYBrep(
  kernel: GeometryKernel,
  component: YComponent,
  profile = {
    armWidthMm: 60,
    structuralDepthMm: 180,
    wallThicknessMm: 8,
  },
): readonly GeometryRepresentation[] {
  return deriveYComponentArmSegments(component).map((segment) =>
    kernel.sweep({
      semanticOwner: component.id,
      pirOperationId: `pir:y-brep:${segment.id}`,
      path: [
        [segment.a[0], segment.a[1], segment.a[2]],
        [segment.b[0], segment.b[1], segment.b[2]],
      ],
      profileWidthMm: profile.armWidthMm,
      profileDepthMm: profile.structuralDepthMm,
      wallThicknessMm: profile.wallThicknessMm,
      featurePath: segment.featurePath,
      profileUp: [
        component.frame.normal[0],
        component.frame.normal[1],
        component.frame.normal[2],
      ],
    }),
  );
}

export function generateD01YFixtureSet(
  kernel: GeometryKernel,
  limit = 10,
): GeometryRepresentation[] {
  const topo = generateD01Topology();
  const network = extractYNetwork(topo, D01_TOPOLOGY_POLICY.diameterMm);
  const retained = network.components.filter((c) => c.trim === 'retained').slice(0, limit);
  return retained.flatMap((c) => generateYBrep(kernel, c));
}
