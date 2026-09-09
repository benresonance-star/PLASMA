import { describe, expect, it, beforeAll } from 'vitest';
import {
  buildOrientedSweepMesh,
  parseGeometryCompileRequest,
} from '@spds/geometry-contracts';
import { compileMeshesDual } from './compile-meshes.js';
import { OcctNativeKernel } from './occt-native-kernel.js';
import { buildGeometryServer } from './server.js';

describe('N1 occt-native constructive B-rep', () => {
  const kernel = new OcctNativeKernel();

  beforeAll(async () => {
    await kernel.ensureReady();
  }, 60_000);

  it('health reports constructiveReady after init', () => {
    const h = kernel.health();
    expect(h.kernel).toBe('occt-native');
    expect(h.constructiveReady).toBe(true);
    expect(h.status).toBe('ok');
    expect(h.binding).toMatch(/opencascade\.js/);
  });

  it('sweep + tessellate produce positive volume and triangles', () => {
    const rep = kernel.sweep({
      semanticOwner: 'component:y:0000',
      pirOperationId: 'pir:y-brep:component:y:0000',
      path: [
        [0, 0, 0],
        [1000, 0, 0],
      ],
      profileWidthMm: 60,
      profileDepthMm: 180,
    });
    expect(rep.kernel).toBe('occt-native');
    expect(rep.mass.volumeMm3).toBeGreaterThan(0);
    expect(rep.fabricationReady).toBe(false);
    expect(rep.semanticOwner).toBe('component:y:0000');

    const mesh = kernel.tessellate({
      representationId: rep.id,
      chordDeviationMm: 1,
      angleDeviationDeg: 20,
    });
    expect(mesh.vertices.length).toBeGreaterThanOrEqual(8);
    expect(mesh.indices.length).toBeGreaterThanOrEqual(36);
  });

  it('extrudes an arbitrary planar profile as constructive B-rep', () => {
    const rep = kernel.extrude({
      semanticOwner: 'panel:F01:01',
      pirOperationId: 'pir:panel-extrude',
      profile: [
        [0, 0, 0],
        [800, 0, 0],
        [800, 600, 0],
        [0, 600, 0],
      ],
      vector: [0, 0, 4],
      featurePath: 'panel:shell',
    });
    expect(rep.mass.volumeMm3).toBeCloseTo(800 * 600 * 4, 3);
    expect(rep.solid.extentsMm).toEqual({
      min: [0, 0, 0],
      max: [800, 600, 4],
    });
    expect(rep.subElementPaths).toContain('panel:F01:01/panel:shell/end');
    expect(rep.topologyElements).toHaveLength(18);
    const edgePath =
      'panel:F01:01/panel:shell/edge:profile-start:0000';
    expect(kernel.resolveTopologyElement(rep.id, edgePath)?.path).toBe(edgePath);
    expect(kernel.resolveNativeEdge(rep.id, edgePath)).toBeDefined();
    const facePath = 'panel:F01:01/panel:shell/face:profile-end';
    expect(kernel.resolveTopologyElement(rep.id, facePath)?.path).toBe(facePath);
    expect(kernel.resolveNativeFace(rep.id, facePath)).toBeDefined();
    const mesh = kernel.tessellate({
      representationId: rep.id,
      chordDeviationMm: 1,
      angleDeviationDeg: 20,
    });
    expect(mesh.indices.length).toBeGreaterThanOrEqual(36);
  });

  it('constructs fillets and chamfers from semantic extrusion edges', () => {
    const source = kernel.extrude({
      semanticOwner: 'part:modifier-source',
      pirOperationId: 'pir:modifier-source',
      profile: [
        [0, 0, 0],
        [40, 0, 0],
        [40, 30, 0],
        [0, 30, 0],
      ],
      vector: [0, 0, 20],
    });
    const edgePath =
      'part:modifier-source/profile:extrude/edge:rail:0000';
    const fillet = kernel.fillet({
      semanticOwner: 'part:filleted',
      pirOperationId: 'pir:filleted',
      sourceRepresentationId: source.id,
      edgePaths: [edgePath],
      radiusMm: 4,
    });
    const chamfer = kernel.chamfer({
      semanticOwner: 'part:chamfered',
      pirOperationId: 'pir:chamfered',
      sourceRepresentationId: source.id,
      edgePaths: [edgePath],
      distanceMm: 3,
    });
    expect(fillet.mass.volumeMm3).toBeLessThan(source.mass.volumeMm3);
    expect(chamfer.mass.volumeMm3).toBeLessThan(source.mass.volumeMm3);
    expect(
      kernel.tessellate({
        representationId: fillet.id,
        chordDeviationMm: 0.5,
        angleDeviationDeg: 15,
      }).indices.length,
    ).toBeGreaterThan(36);
    expect(() =>
      kernel.fillet({
        semanticOwner: 'part:invalid-fillet',
        pirOperationId: 'pir:invalid-fillet',
        sourceRepresentationId: source.id,
        edgePaths: ['part:modifier-source/edge:missing'],
        radiusMm: 2,
      }),
    ).toThrow(/Unknown semantic edge/);
  });

  it('constructs an open shell from a semantic extrusion face', () => {
    const source = kernel.extrude({
      semanticOwner: 'part:shell-source',
      pirOperationId: 'pir:shell-source',
      profile: [
        [0, 0, 0],
        [40, 0, 0],
        [40, 30, 0],
        [0, 30, 0],
      ],
      vector: [0, 0, 20],
    });
    const removedFacePath =
      'part:shell-source/profile:extrude/face:profile-end';
    const shelled = kernel.shellFaces({
      semanticOwner: 'part:open-shell',
      pirOperationId: 'pir:open-shell',
      sourceRepresentationId: source.id,
      removedFacePaths: [removedFacePath],
      thicknessMm: 2,
      inward: true,
    });
    expect(shelled.mass.volumeMm3).toBeCloseTo(
      40 * 30 * 20 - 36 * 26 * 18,
      3,
    );
    expect(shelled.solid.extentsMm.min[0]).toBeCloseTo(0, 2);
    expect(shelled.solid.extentsMm.max[2]).toBeCloseTo(20, 2);
    expect(() =>
      kernel.shellFaces({
        semanticOwner: 'part:invalid-shell',
        pirOperationId: 'pir:invalid-shell',
        sourceRepresentationId: source.id,
        removedFacePaths: ['part:shell-source/face:missing'],
        thicknessMm: 2,
        inward: true,
      }),
    ).toThrow(/Unknown semantic face/);
  });

  it('constructs a draft from a semantic extrusion face', () => {
    const source = kernel.extrude({
      semanticOwner: 'part:draft-source',
      pirOperationId: 'pir:draft-source',
      profile: [
        [0, 0, 0],
        [40, 0, 0],
        [40, 30, 0],
        [0, 30, 0],
      ],
      vector: [0, 0, 20],
    });
    const selectedFacePath =
      'part:draft-source/profile:extrude/face:side:0000';
    const drafted = kernel.draftFaces({
      semanticOwner: 'part:drafted',
      pirOperationId: 'pir:drafted',
      sourceRepresentationId: source.id,
      selectedFacePaths: [selectedFacePath],
      pullDirection: [0, 0, 1],
      neutralPlaneOrigin: [0, 0, 0],
      neutralPlaneNormal: [0, 0, 1],
      angleDeg: 5,
      reverse: false,
    });
    expect(drafted.mass.volumeMm3).not.toBeCloseTo(source.mass.volumeMm3, 3);
    expect(drafted.validationState).toBe('geometry-generated');
    expect(
      kernel.tessellate({
        representationId: drafted.id,
        chordDeviationMm: 0.5,
        angleDeviationDeg: 15,
      }).indices.length,
    ).toBeGreaterThanOrEqual(36);
  });

  it('constructs revolve and ruled loft B-reps', () => {
    const revolved = kernel.revolve({
      semanticOwner: 'part:revolve',
      pirOperationId: 'pir:revolve',
      profile: [
        [20, 0, 0],
        [50, 0, 0],
        [50, 0, 100],
        [20, 0, 100],
      ],
      axisOrigin: [0, 0, 0],
      axisDirection: [0, 0, 1],
      angleDeg: 360,
      segments: 64,
    });
    expect(revolved.mass.volumeMm3).toBeCloseTo(
      Math.PI * (50 ** 2 - 20 ** 2) * 100,
      1,
    );

    const lofted = kernel.loft({
      semanticOwner: 'part:loft',
      pirOperationId: 'pir:loft',
      profiles: [
        [
          [-5, -5, 0],
          [5, -5, 0],
          [5, 5, 0],
          [-5, 5, 0],
        ],
        [
          [-10, -10, 100],
          [10, -10, 100],
          [10, 10, 100],
          [-10, 10, 100],
        ],
      ],
      ruled: true,
    });
    expect(lofted.mass.volumeMm3).toBeCloseTo(70000 / 3, 3);
    expect(lofted.topologyElements).toHaveLength(18);
    const loftEdgePath = 'part:loft/profile:loft/edge:rail:0000:0000';
    const loftFacePath = 'part:loft/profile:loft/face:profile-end';
    expect(kernel.resolveNativeEdge(lofted.id, loftEdgePath)).toBeDefined();
    expect(kernel.resolveNativeFace(lofted.id, loftFacePath)).toBeDefined();
    const filletedLoft = kernel.fillet({
      semanticOwner: 'part:loft-filleted',
      pirOperationId: 'pir:loft-filleted',
      sourceRepresentationId: lofted.id,
      edgePaths: [loftEdgePath],
      radiusMm: 1,
    });
    expect(filletedLoft.mass.volumeMm3).toBeLessThan(lofted.mass.volumeMm3);
    expect(
      kernel.tessellate({
        representationId: lofted.id,
        chordDeviationMm: 1,
        angleDeviationDeg: 20,
      }).indices.length,
    ).toBeGreaterThanOrEqual(36);
  });

  it('preserves source topology across multi-section ruled lofts', () => {
    const lofted = kernel.loft({
      semanticOwner: 'part:multi-loft',
      pirOperationId: 'pir:multi-loft',
      profiles: [
        [
          [-5, -5, 0],
          [5, -5, 0],
          [5, 5, 0],
          [-5, 5, 0],
        ],
        [
          [-8, -8, 50],
          [8, -8, 50],
          [8, 8, 50],
          [-8, 8, 50],
        ],
        [
          [-10, -10, 100],
          [10, -10, 100],
          [10, 10, 100],
          [-10, 10, 100],
        ],
      ],
      ruled: true,
    });
    expect(lofted.topologyElements).toHaveLength(30);
    expect(
      kernel.resolveNativeFace(
        lofted.id,
        'part:multi-loft/profile:loft/face:side:0001:0002',
      ),
    ).toBeDefined();
  });

  it('constructs union, cut, and intersection B-reps', () => {
    const left = kernel.extrude({
      semanticOwner: 'part:boolean-left',
      pirOperationId: 'pir:boolean-left',
      profile: [
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ],
      vector: [0, 0, 10],
    });
    const right = kernel.extrude({
      semanticOwner: 'part:boolean-right',
      pirOperationId: 'pir:boolean-right',
      profile: [
        [5, 0, 0],
        [15, 0, 0],
        [15, 10, 0],
        [5, 10, 0],
      ],
      vector: [0, 0, 10],
    });
    const expected = { union: 1500, cut: 500, intersect: 500 } as const;
    for (const operation of ['union', 'cut', 'intersect'] as const) {
      const result = kernel.boolean({
        semanticOwner: `part:${operation}`,
        pirOperationId: `pir:${operation}`,
        operation,
        leftRepresentationId: left.id,
        rightRepresentationId: right.id,
      });
      expect(result.mass.volumeMm3).toBeCloseTo(expected[operation], 6);
    }
  });

  it('trims a solid against an explicit plane half-space', () => {
    const source = kernel.extrude({
      semanticOwner: 'part:trim-source',
      pirOperationId: 'pir:trim-source',
      profile: [
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ],
      vector: [0, 0, 10],
    });
    const trimmed = kernel.trimPlane({
      semanticOwner: 'part:trimmed',
      pirOperationId: 'pir:trimmed',
      sourceRepresentationId: source.id,
      planeOrigin: [5, 0, 0],
      planeNormal: [1, 0, 0],
      keep: 'positive',
    });
    expect(trimmed.mass.volumeMm3).toBeCloseTo(500, 6);
    expect(trimmed.solid.extentsMm.min[0]).toBeCloseTo(5, 5);
    expect(trimmed.solid.extentsMm.max[0]).toBeCloseTo(10, 5);
  });

  it('diagonal path uses oriented prism extents matching exact-adapter', () => {
    const path: [number, number, number][] = [
      [-2856, 5804, 7625],
      [-2253, 4156, 9105],
    ];
    const w = 60;
    const d = 180;
    const profileUp: [number, number, number] = [0, 0, 1];
    const expected = buildOrientedSweepMesh({
      path,
      profileWidthMm: w,
      profileDepthMm: d,
      profileUp,
    });
    const rep = kernel.sweep({
      semanticOwner: 'component:y:diag-aabb',
      pirOperationId: 'pir:diag-aabb',
      path,
      profileWidthMm: w,
      profileDepthMm: d,
      wallThicknessMm: 8,
      profileUp,
    });
    expect(rep.solid.extentsMm.min[0]).toBeCloseTo(expected.extentsMm.min[0], 5);
    expect(rep.solid.extentsMm.min[1]).toBeCloseTo(expected.extentsMm.min[1], 5);
    expect(rep.solid.extentsMm.min[2]).toBeCloseTo(expected.extentsMm.min[2], 5);
    expect(rep.solid.extentsMm.max[0]).toBeCloseTo(expected.extentsMm.max[0], 5);
    expect(rep.solid.extentsMm.max[1]).toBeCloseTo(expected.extentsMm.max[1], 5);
    expect(rep.solid.extentsMm.max[2]).toBeCloseTo(expected.extentsMm.max[2], 5);
    const solidVol =
      w * d * Math.hypot(
        path[1]![0] - path[0]![0],
        path[1]![1] - path[0]![1],
        path[1]![2] - path[0]![2],
      );
    expect(rep.mass.volumeMm3).toBeLessThan(solidVol);
    const mesh = kernel.tessellate({
      representationId: rep.id,
      chordDeviationMm: 1,
      angleDeviationDeg: 20,
    });
    expect(mesh.vertices.length).toBeGreaterThanOrEqual(8);
  });

  it('regen keeps semantic owners; multi-segment path uses combined extents', () => {
    const a = kernel.sweep({
      semanticOwner: 'component:y:0001',
      pirOperationId: 'pir:y-brep:component:y:0001',
      path: [
        [0, 0, 0],
        [500, 0, 0],
      ],
      profileWidthMm: 40,
      profileDepthMm: 40,
    });
    const b = kernel.sweep({
      semanticOwner: 'component:y:0001',
      pirOperationId: 'pir:y-brep:component:y:0001',
      path: [
        [0, 0, 0],
        [500, 0, 0],
      ],
      profileWidthMm: 40,
      profileDepthMm: 40,
    });
    expect(a.id).toBe(b.id);
    expect(a.semanticOwner).toBe(b.semanticOwner);
    const multi = kernel.sweep({
      semanticOwner: 'component:y:multi',
      pirOperationId: 'pir:multi',
      path: [
        [0, 0, 0],
        [100, 0, 0],
        [200, 50, 0],
      ],
      profileWidthMm: 40,
      profileDepthMm: 40,
    });
    expect(multi.mass.volumeMm3).toBeGreaterThan(0);
  });

  it('shell fails when offset exceeds profile', () => {
    const rep = kernel.sweep({
      semanticOwner: 'component:y:shell',
      pirOperationId: 'pir:shell',
      path: [
        [0, 0, 0],
        [400, 0, 0],
      ],
      profileWidthMm: 40,
      profileDepthMm: 40,
    });
    try {
      kernel.shell({
        representationId: rep.id,
        semanticOwner: 'component:y:shell',
        offsetMm: 30,
      });
      expect.unreachable('shell should fail');
    } catch (err) {
      const e = err as { code?: string };
      expect(e.code).toBe('HEALING_FAILED');
    }
  });

  it('shell cuts a cavity from an oriented sweep', () => {
    const rep = kernel.sweep({
      semanticOwner: 'component:y:oriented-shell',
      pirOperationId: 'pir:oriented-shell',
      path: [
        [0, 0, 0],
        [300, 200, 100],
      ],
      profileWidthMm: 60,
      profileDepthMm: 100,
      profileUp: [0, 0, 1],
    });
    const shell = kernel.shell({
      representationId: rep.id,
      semanticOwner: rep.semanticOwner,
      offsetMm: 8,
    });
    expect(shell.mass.volumeMm3).toBeGreaterThan(0);
    expect(shell.mass.volumeMm3).toBeLessThan(rep.mass.volumeMm3);
    expect(shell.solid.extentsMm).toEqual(rep.solid.extentsMm);
    expect(
      kernel.tessellate({
        representationId: shell.id,
        chordDeviationMm: 1,
        angleDeviationDeg: 20,
      }).indices.length,
    ).toBeGreaterThan(36);
  });

  it('compile/meshes native path returns constructive meshes', async () => {
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:native',
      pirHash: 'pir:native',
      dagHash: 'dag:native',
      compilerVersion: 'native-test',
      parameters: { lengthMm: 1000 },
      ops: [
        {
          op: 'geometry.sweep@1.0.0',
          semanticOwner: 'component:y:0000',
          pirOperationId: 'pir:y-brep:component:y:0000',
          path: [
            [0, 0, 0],
            [500, 0, 0],
          ],
          profileWidthMm: 60,
          profileDepthMm: 180,
        },
      ],
    });
    const dual = await compileMeshesDual({
      compile: req,
      nativeKernel: kernel,
    });
    expect(dual.occtNative?.kernel).toBe('occt-native');
    expect(dual.occtNative?.meshes[0]?.semanticOwner).toBe('component:y:0000');
    expect(dual.occtNative?.meshes[0]?.triangleCount).toBeGreaterThan(0);
    expect(dual.occtNative?.stepHashes).toHaveLength(1);
    expect(dual.occtNative?.stepHashes[0]).toHaveLength(64);
  }, 60_000);

  it('HTTP health under native kernel', async () => {
    const { app } = buildGeometryServer(kernel);
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json().kernel).toBe('occt-native');
    expect(health.json().constructiveReady).toBe(true);
  });
});
