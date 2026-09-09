import { describe, expect, it } from 'vitest';
import { ExactKernelAdapter } from './exact-kernel.js';
import { generateD01YFixtureSet, generateYBrep } from './y-brep.js';
import { buildGeometryServer } from './server.js';
import {
  D01_TOPOLOGY_POLICY,
  extractYNetwork,
  generateD01Topology,
} from '@spds/topology-operators';

describe('G6 geometry service', () => {
  it('serves health/version and basic sweep/tessellate with positive volume', async () => {
    // Pin exact-adapter so ambient GEOMETRY_KERNEL=occt-native does not pollute CI-default suite.
    const { app } = buildGeometryServer(new ExactKernelAdapter());
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json().kernel).toBe('exact-adapter');

    const sweep = await app.inject({
      method: 'POST',
      url: '/v1/sweep',
      payload: {
        semanticOwner: 'component:y:0001',
        pirOperationId: 'pir:test',
        path: [
          [0, 0, 0],
          [1000, 0, 0],
        ],
        profileWidthMm: 60,
        profileDepthMm: 180,
      },
    });
    expect(sweep.statusCode).toBe(201);
    const rep = sweep.json();
    expect(rep.mass.volumeMm3).toBeGreaterThan(0);
    expect(rep.validationState).toBe('geometry-generated');

    const mesh = await app.inject({
      method: 'POST',
      url: '/v1/tessellate',
      payload: {
        representationId: rep.id,
        chordDeviationMm: 0.5,
        angleDeviationDeg: 15,
      },
    });
    expect(mesh.statusCode).toBe(200);
    expect(mesh.json().maxDeviationMm).toBeLessThanOrEqual(0.5);
  });

  it('generates valid Y B-reps for D01 fixture set with stable semantic owners', () => {
    const kernel = new ExactKernelAdapter();
    const topo = generateD01Topology();
    const network = extractYNetwork(topo, D01_TOPOLOGY_POLICY.diameterMm);
    const first = network.components.find((c) => c.trim === 'retained')!;
    const a = generateYBrep(kernel, first);
    const b = generateYBrep(kernel, first);
    expect(a).toHaveLength(3);
    expect(a.map((representation) => representation.id)).toEqual(
      b.map((representation) => representation.id),
    );
    expect(a.every((representation) => representation.semanticOwner === first.id)).toBe(true);
    expect(a.every((representation) => representation.mass.volumeMm3 > 0)).toBe(true);
    expect(a.flatMap((representation) => representation.subElementPaths)).toEqual(
      expect.arrayContaining([
        `${first.id}/arm:A/start`,
        `${first.id}/arm:B/start`,
        `${first.id}/arm:C/start`,
      ]),
    );

    const set = generateD01YFixtureSet(kernel, 10);
    expect(set).toHaveLength(30);
    expect(set.every((r) => r.fabricationReady)).toBe(true);
  });

  it('returns structured shell failure without crashing and blocks fabrication', async () => {
    const { app } = buildGeometryServer(new ExactKernelAdapter());
    const sweep = await app.inject({
      method: 'POST',
      url: '/v1/sweep',
      payload: {
        semanticOwner: 'component:y:shell',
        pirOperationId: 'pir:shell',
        path: [
          [0, 0, 0],
          [500, 0, 0],
        ],
        profileWidthMm: 40,
        profileDepthMm: 40,
      },
    });
    const rep = sweep.json();
    const shell = await app.inject({
      method: 'POST',
      url: '/v1/shell',
      payload: {
        representationId: rep.id,
        offsetMm: 30,
        semanticOwner: 'component:y:shell',
      },
    });
    expect(shell.statusCode).toBe(422);
    expect(shell.json().code).toBe('HEALING_FAILED');
    expect(shell.json().recoverable).toBe(true);
  });
});
