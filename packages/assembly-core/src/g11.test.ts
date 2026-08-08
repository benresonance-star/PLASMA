import { describe, expect, it } from 'vitest';
import { ConnectionSchema, connectsToRelations } from './connections.js';
import {
  applyBoltedPlatePattern,
  DEMO_FASTENER_LIBRARY,
  syncHolesForConnection,
} from './fasteners.js';
import { fabricationReadyBlocked, validateConnection } from './connection-validation.js';
import { MateSchema } from './types.js';

describe('G11 connections and fasteners', () => {
  it('keeps Connection distinct from Mate and emits connects-to', () => {
    const conn = ConnectionSchema.parse({
      id: 'conn:1',
      kind: 'Connection',
      connectionType: 'bolted',
      componentInstanceIds: ['inst:a', 'inst:b'],
      relatedMateId: 'mate:1',
      fastenerIds: ['fast:M12x40'],
    });
    const mate = MateSchema.parse({
      id: 'mate:1',
      kind: 'Mate',
      mateType: 'coincident',
      a: { instanceId: 'inst:a', selector: 'sel:a' },
      b: { instanceId: 'inst:b', selector: 'sel:b' },
    });
    expect(conn.kind).not.toBe(mate.kind);
    expect(connectsToRelations(conn)).toEqual([
      {
        fromInstanceId: 'inst:a',
        toInstanceId: 'inst:b',
        connectionId: 'conn:1',
        relation: 'connects-to',
      },
    ]);
  });

  it('applies bolted plate pattern and regenerates holes on disconnect', () => {
    expect(DEMO_FASTENER_LIBRARY.every((f) => f.authoritative === false)).toBe(true);
    const patterned = applyBoltedPlatePattern({
      connectionId: 'conn:1',
      plateInstanceIds: ['plate:1', 'plate:2'],
      fastenerId: 'fast:M12x40',
      holeCountPerPlate: 2,
    });
    expect(patterned.holeRequirements).toHaveLength(4);
    expect(patterned.patternId).toBe('pattern:BoltedPlateConnection');

    let holes = patterned.holeRequirements;
    holes = syncHolesForConnection(holes, 'conn:1', null);
    expect(holes).toHaveLength(0);
  });

  it('blocks fabrication-ready on hard connection failures', () => {
    const issues = validateConnection({
      connectionId: 'conn:1',
      edgeDistanceMm: 5,
      minEdgeDistanceMm: 18,
      clearanceMm: 1,
      minClearanceMm: 2,
      interferes: false,
    });
    expect(issues.some((i) => i.severity === 'fail')).toBe(true);
    expect(fabricationReadyBlocked(issues)).toBe(true);
    expect(issues.some((i) => i.severity === 'warn')).toBe(true);
  });
});
