import type { GeometryRepresentation } from '@spds/geometry-contracts';
import {
  D01_TOPOLOGY_POLICY,
  extractYNetwork,
  generateD01Topology,
  type YComponent,
} from '@spds/topology-operators';
import type { ExactKernelAdapter } from './exact-kernel.js';

export function generateYBrep(
  kernel: ExactKernelAdapter,
  component: YComponent,
  profile = {
    armWidthMm: 60,
    structuralDepthMm: 180,
    wallThicknessMm: 8,
  },
): GeometryRepresentation {
  const origin = component.frame.origin;
  const arm = component.arms[0]!;
  const start: [number, number, number] = [origin[0], origin[1], origin[2]];
  const end: [number, number, number] = [
    origin[0] + component.frame.tangent[0] * arm.lengthMmPlaceholder,
    origin[1] + component.frame.tangent[1] * arm.lengthMmPlaceholder,
    origin[2] + component.frame.tangent[2] * arm.lengthMmPlaceholder,
  ];
  return kernel.sweep({
    semanticOwner: component.id,
    pirOperationId: `pir:y-brep:${component.id}`,
    path: [start, end],
    profileWidthMm: profile.armWidthMm,
    profileDepthMm: profile.structuralDepthMm,
    wallThicknessMm: profile.wallThicknessMm,
  });
}

export function generateD01YFixtureSet(
  kernel: ExactKernelAdapter,
  limit = 10,
): GeometryRepresentation[] {
  const topo = generateD01Topology();
  const network = extractYNetwork(topo, D01_TOPOLOGY_POLICY.diameterMm);
  const retained = network.components.filter((c) => c.trim === 'retained').slice(0, limit);
  return retained.map((c) => generateYBrep(kernel, c));
}
