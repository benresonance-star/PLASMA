/**
 * G11 gate — connection modification updates derived holes + BOM deterministically.
 * Geometry boolean holes remain adapter-side; this package owns semantic effects.
 */

import { applyBoltedPlatePattern, syncHolesForConnection, type HoleRequirement } from './fasteners.js';

export interface BomLine {
  readonly itemId: string;
  readonly kind: 'fastener' | 'plate' | 'hole-operation';
  readonly quantity: number;
  readonly connectionId: string | null;
}

export interface ConnectionEffectState {
  readonly holes: readonly HoleRequirement[];
  readonly bom: readonly BomLine[];
  readonly geometryDirtyIds: readonly string[];
}

function bomFromHoles(
  connectionId: string,
  fastenerId: string,
  plateIds: readonly string[],
  holes: readonly HoleRequirement[],
): BomLine[] {
  const connHoles = holes.filter((h) => h.connectionId === connectionId);
  return [
    {
      itemId: fastenerId,
      kind: 'fastener',
      quantity: connHoles.length,
      connectionId,
    },
    ...plateIds.map((plateId) => ({
      itemId: plateId,
      kind: 'plate' as const,
      quantity: 1,
      connectionId,
    })),
    {
      itemId: `op:holes:${connectionId}`,
      kind: 'hole-operation',
      quantity: connHoles.length,
      connectionId,
    },
  ];
}

/** Apply or update a bolted connection — regenerates holes, BOM, and dirty geometry ids. */
export function applyConnectionChange(input: {
  readonly state: ConnectionEffectState;
  readonly connectionId: string;
  readonly plateInstanceIds: readonly string[];
  readonly fastenerId: string;
  readonly holeCountPerPlate: number;
}): ConnectionEffectState {
  const patterned = applyBoltedPlatePattern({
    connectionId: input.connectionId,
    plateInstanceIds: input.plateInstanceIds,
    fastenerId: input.fastenerId,
    holeCountPerPlate: input.holeCountPerPlate,
  });
  const holes = syncHolesForConnection(
    input.state.holes,
    input.connectionId,
    patterned.holeRequirements,
  );
  const otherBom = input.state.bom.filter((b) => b.connectionId !== input.connectionId);
  const bom = [
    ...otherBom,
    ...bomFromHoles(input.connectionId, input.fastenerId, input.plateInstanceIds, holes),
  ];
  const geometryDirtyIds = [...new Set([...input.plateInstanceIds, ...holes.map((h) => h.holeId)])].sort();
  return { holes, bom, geometryDirtyIds };
}

/** Remove connection — drops holes/BOM lines and marks plates dirty for regen. */
export function removeConnection(input: {
  readonly state: ConnectionEffectState;
  readonly connectionId: string;
  readonly plateInstanceIds: readonly string[];
}): ConnectionEffectState {
  const holes = syncHolesForConnection(input.state.holes, input.connectionId, null);
  const bom = input.state.bom.filter((b) => b.connectionId !== input.connectionId);
  return {
    holes,
    bom,
    geometryDirtyIds: [...input.plateInstanceIds].sort(),
  };
}

export function emptyConnectionEffectState(): ConnectionEffectState {
  return { holes: [], bom: [], geometryDirtyIds: [] };
}
