import type { Box3, Point3, RoutingProblem, ServiceKind, ServiceRunRequest } from '@spds/services-network-core';

export interface Room {
  readonly name: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly tone: number;
}

export interface Fixture {
  readonly id: string;
  readonly label: string;
  readonly location: Point3;
  readonly kind: 'plumbing' | 'electrical' | 'furniture' | 'plant';
}

export const ROOMS: readonly Room[] = [
  { name: 'BEDROOM 1', x0: 150, y0: 150, x1: 4450, y1: 3900, tone: 0xf5f2eb },
  { name: 'HALL / LAUNDRY', x0: 4550, y0: 150, x1: 7450, y1: 3900, tone: 0xebece8 },
  { name: 'BEDROOM 2', x0: 7550, y0: 150, x1: 11850, y1: 3900, tone: 0xf5f2eb },
  { name: 'BATHROOM', x0: 150, y0: 4100, x1: 3900, y1: 7850, tone: 0xe4ebe9 },
  { name: 'KITCHEN / DINING', x0: 4100, y0: 4100, x1: 7600, y1: 7850, tone: 0xf2ede4 },
  { name: 'LIVING', x0: 7750, y0: 4100, x1: 11850, y1: 7850, tone: 0xf2f0eb },
];

export const FIXTURES: readonly Fixture[] = [
  { id: 'shower', label: 'SHOWER', location: [1000, 7000, 150], kind: 'plumbing' },
  { id: 'basin', label: 'BASIN', location: [2750, 6500, 150], kind: 'plumbing' },
  { id: 'wc', label: 'WC', location: [3250, 7500, 150], kind: 'plumbing' },
  { id: 'kitchen-sink', label: 'KITCHEN SINK', location: [6000, 6000, 150], kind: 'plumbing' },
  { id: 'laundry', label: 'LAUNDRY', location: [6000, 3000, 150], kind: 'plumbing' },
  { id: 'water-manifold', label: 'WATER MANIFOLD', location: [500, 4200, 150], kind: 'plant' },
  { id: 'switchboard', label: 'SWITCHBOARD', location: [11500, 1500, 150], kind: 'plant' },
  { id: 'living-light', label: 'LIGHT', location: [10000, 6500, 150], kind: 'electrical' },
  { id: 'kitchen-light', label: 'LIGHT', location: [6000, 7000, 150], kind: 'electrical' },
  { id: 'bath-light', label: 'LIGHT', location: [2500, 6500, 150], kind: 'electrical' },
  { id: 'bed1-light', label: 'LIGHT', location: [2500, 2000, 150], kind: 'electrical' },
  { id: 'bed2-light', label: 'LIGHT', location: [9500, 2000, 150], kind: 'electrical' },
];

export interface ScenarioOptions {
  readonly water: boolean;
  readonly electrical: boolean;
  readonly obstruction: boolean;
}

function run(
  id: string, system: ServiceKind, source: Point3, destination: Point3,
  nominalDiameterMm: number,
): ServiceRunRequest {
  return {
    id, system, source, destination, nominalDiameterMm,
    clearanceMm: 55, minServiceSeparationMm: 75,
    semanticOwnerId: `fixture:${id}`,
  };
}

export function houseScenario(options: ScenarioOptions): RoutingProblem {
  const water: ServiceRunRequest[] = [
    run('Bathroom shower', 'water', [500, 6000, 1000], [1000, 7000, 1000], 32),
    run('Bathroom basin', 'water', [500, 5500, 1000], [2500, 6500, 1000], 25),
    run('WC cistern', 'water', [500, 5000, 1000], [3000, 7500, 1000], 25),
    run('Kitchen sink', 'water', [500, 4500, 1000], [6000, 6000, 1000], 25),
    run('Laundry taps', 'water', [500, 4000, 1000], [6000, 3000, 1000], 25),
  ];
  const electrical: ServiceRunRequest[] = [
    run('Living lighting', 'electrical', [11500, 500, 2000], [10000, 6500, 2000], 30),
    run('Kitchen lighting', 'electrical', [11500, 1000, 2000], [6000, 7000, 2000], 30),
    run('Bathroom lighting', 'electrical', [11500, 1500, 2000], [2500, 6500, 2000], 30),
    run('Bedroom 1 lighting', 'electrical', [11500, 2000, 2000], [2500, 2000, 2000], 30),
    run('Bedroom 2 lighting', 'electrical', [11500, 2500, 2000], [9500, 2000, 2000], 30),
  ];
  const beam: Box3 = {
    id: 'structural-beam / keep-out', min: [4000, 4550, 500], max: [4500, 6200, 2500],
    semanticOwnerId: 'structure:beam-01',
  };
  return {
    envelope: { id: 'house', min: [0, 0, 0], max: [12000, 8000, 3000] },
    // Room partitions intentionally omitted as collision keep-outs: a wall penetration model does not yet exist.
    obstructions: options.obstruction ? [beam] : [],
    runs: [ ...(options.water ? water : []), ...(options.electrical ? electrical : []) ],
    gridStepMm: 500, bendPenaltyMm: 180, verticalPenalty: 1.8,
    maxExpandedNodes: 30000,
  };
}
