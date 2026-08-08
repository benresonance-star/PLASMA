/** G11.2–G11.4 Bolted plate pattern, fastener library, derived holes. */

export interface FastenerSpec {
  readonly id: string;
  readonly designation: string;
  readonly diameterMm: number;
  readonly lengthMm: number;
  readonly grade: string;
  /** Seed data is demonstration-only — not authoritative ISO. */
  readonly authoritative: false;
  readonly source: 'demo-seed';
}

export const DEMO_FASTENER_LIBRARY: readonly FastenerSpec[] = [
  {
    id: 'fast:M12x40',
    designation: 'ISO 4014 M12×40 (demo)',
    diameterMm: 12,
    lengthMm: 40,
    grade: '8.8',
    authoritative: false,
    source: 'demo-seed',
  },
  {
    id: 'fast:M16x50',
    designation: 'ISO 4014 M16×50 (demo)',
    diameterMm: 16,
    lengthMm: 50,
    grade: '8.8',
    authoritative: false,
    source: 'demo-seed',
  },
  {
    id: 'fast:washer-M12',
    designation: 'Washer M12 (demo)',
    diameterMm: 12,
    lengthMm: 2.5,
    grade: '200HV',
    authoritative: false,
    source: 'demo-seed',
  },
];

export interface HoleRequirement {
  readonly holeId: string;
  readonly connectionId: string;
  readonly plateInstanceId: string;
  readonly diameterMm: number;
  readonly derived: true;
}

export interface BoltedPlatePatternResult {
  readonly patternId: string;
  readonly connectionId: string;
  readonly plateInstanceIds: readonly string[];
  readonly holeRequirements: readonly HoleRequirement[];
  readonly fastenerIds: readonly string[];
}

export function applyBoltedPlatePattern(input: {
  readonly connectionId: string;
  readonly plateInstanceIds: readonly string[];
  readonly fastenerId: string;
  readonly holeCountPerPlate: number;
}): BoltedPlatePatternResult {
  const fastener = DEMO_FASTENER_LIBRARY.find((f) => f.id === input.fastenerId);
  if (!fastener) throw new Error(`Unknown fastener ${input.fastenerId}`);
  const holes: HoleRequirement[] = [];
  for (const plateId of input.plateInstanceIds) {
    for (let i = 0; i < input.holeCountPerPlate; i++) {
      holes.push({
        holeId: `hole:${input.connectionId}:${plateId}:${i}`,
        connectionId: input.connectionId,
        plateInstanceId: plateId,
        diameterMm: fastener.diameterMm + 1,
        derived: true,
      });
    }
  }
  return {
    patternId: 'pattern:BoltedPlateConnection',
    connectionId: input.connectionId,
    plateInstanceIds: input.plateInstanceIds,
    holeRequirements: holes,
    fastenerIds: [input.fastenerId],
  };
}

/** Connection delete/update regenerates or removes derived holes. */
export function syncHolesForConnection(
  existing: readonly HoleRequirement[],
  connectionId: string,
  next: readonly HoleRequirement[] | null,
): HoleRequirement[] {
  const retained = existing.filter((h) => h.connectionId !== connectionId);
  if (next === null) return retained;
  return [...retained, ...next.filter((h) => h.connectionId === connectionId)];
}
