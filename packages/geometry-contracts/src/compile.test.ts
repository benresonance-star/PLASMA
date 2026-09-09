import { describe, expect, it } from 'vitest';
import { compileRequestDigest, parseGeometryCompileRequest } from './compile.js';
import { executeExactCompile } from './compile-exact.js';
import { InProcessGeometryKernel } from './kernel.js';

const sampleOp = {
  op: 'geometry.sweep@1.0.0' as const,
  semanticOwner: 'component:y:0000',
  pirOperationId: 'pir:y-brep:component:y:0000',
  path: [
    [0, 0, 0],
    [1000, 0, 0],
  ] as [number, number, number][],
  profileWidthMm: 60,
  profileDepthMm: 180,
  wallThicknessMm: 8,
  featurePath: 'arm:y:0000:0',
};

describe('GeometryCompileRequest', () => {
  it('round-trips and digests parameters', () => {
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:1',
      pirHash: 'pir:1',
      dagHash: 'dag:1',
      compilerVersion: 'geometry-contracts@test',
      parameters: { lengthMm: 2300 },
      ops: [sampleOp],
    });
    expect(req.ops[0]!.semanticOwner).toBe('component:y:0000');
    const a = compileRequestDigest(req);
    const b = compileRequestDigest({
      ...req,
      parameters: { lengthMm: 2500 },
    });
    expect(a).not.toBe(b);
  });

  it('rejects missing owner and OCCT class names', () => {
    expect(() =>
      parseGeometryCompileRequest({
        snapshotHash: 's',
        pirHash: 'p',
        dagHash: 'd',
        compilerVersion: 't',
        ops: [{ ...sampleOp, semanticOwner: '' }],
      }),
    ).toThrow();
    expect(() =>
      parseGeometryCompileRequest({
        snapshotHash: 's',
        pirHash: 'p',
        dagHash: 'd',
        compilerVersion: 't',
        ops: [{ ...sampleOp, pirOperationId: 'pir:TopoDS_Shape:1' }],
      }),
    ).toThrow(/OCCT/i);
    expect(() =>
      parseGeometryCompileRequest({
        snapshotHash: 's',
        pirHash: 'p',
        dagHash: 'd',
        compilerVersion: 't',
        ops: [
          {
            op: 'geometry.extrude@1.0.0',
            semanticOwner: 'panel:invalid',
            pirOperationId: 'pir:invalid',
            profile: [
              [0, 0, 0],
              [10, 0, 0],
              [0, 10, 0],
            ],
            vector: [0, 0, 0],
          },
        ],
      }),
    ).toThrow(/non-zero/);
  });

  it('benchmarks 10k four-operator-union parses under 75ms', () => {
    const payload = {
      snapshotHash: 'snap:1',
      pirHash: 'pir:1',
      dagHash: 'dag:1',
      compilerVersion: 'geometry-contracts@test',
      parameters: { lengthMm: 2300 },
      ops: [sampleOp],
    };
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) {
      parseGeometryCompileRequest(payload);
    }
    expect(performance.now() - t0).toBeLessThan(75);
  });

  it('exact compile produces meshes with owners', () => {
    const kernel = new InProcessGeometryKernel();
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:1',
      pirHash: 'pir:1',
      dagHash: 'dag:1',
      compilerVersion: 'geometry-contracts@test',
      parameters: { lengthMm: 1000 },
      ops: [sampleOp],
    });
    const result = executeExactCompile(kernel, req);
    expect(result.meshes).toHaveLength(1);
    expect(result.meshes[0]!.semanticOwner).toBe('component:y:0000');
    expect(result.meshes[0]!.triangleCount).toBeGreaterThan(0);
    expect(result.representations[0]!.subElementPaths).toContain(
      'component:y:0000/arm:y:0000:0/start',
    );
    expect(result.compileHash).toHaveLength(64);
    expect(result.artifactHashes).toHaveLength(1);
    expect(result.artifactHashes[0]).toHaveLength(64);
  });

  it('exact compile tessellates diagonal sweeps as oriented prisms', () => {
    const kernel = new InProcessGeometryKernel();
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:diagonal',
      pirHash: 'pir:diagonal',
      dagHash: 'dag:diagonal',
      compilerVersion: 'geometry-contracts@test',
      ops: [
        {
          ...sampleOp,
          pirOperationId: 'pir:diagonal',
          path: [
            [0, 0, 0],
            [100, 100, 0],
          ],
          profileWidthMm: 20,
          profileDepthMm: 10,
          wallThicknessMm: 2,
          profileUp: [0, 0, 1],
        },
      ],
    });
    const result = executeExactCompile(kernel, req);
    const mesh = result.meshes[0]!;
    expect(mesh.vertices).toHaveLength(8);
    const xs = new Set(mesh.vertices.map((vertex) => vertex[0]));
    const ys = new Set(mesh.vertices.map((vertex) => vertex[1]));
    expect(xs.size).toBeGreaterThan(2);
    expect(ys.size).toBeGreaterThan(2);
  });

  it('dispatches planar extrusions through the same compile request', () => {
    const kernel = new InProcessGeometryKernel();
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:extrude',
      pirHash: 'pir:extrude',
      dagHash: 'dag:extrude',
      compilerVersion: 'geometry-contracts@test',
      ops: [
        {
          op: 'geometry.extrude@1.0.0',
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
        },
      ],
    });
    const result = executeExactCompile(kernel, req);
    expect(result.meshes[0]?.triangleCount).toBe(12);
    expect(result.representations[0]?.mass.volumeMm3).toBe(800 * 600 * 4);
    expect(result.representations[0]?.subElementPaths).toContain(
      'panel:F01:01/panel:shell/end',
    );
  });

  it('dispatches revolve and loft operations exhaustively', () => {
    const kernel = new InProcessGeometryKernel();
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:forms',
      pirHash: 'pir:forms',
      dagHash: 'dag:forms',
      compilerVersion: 'geometry-contracts@test',
      ops: [
        {
          op: 'geometry.revolve@1.0.0',
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
          segments: 32,
        },
        {
          op: 'geometry.loft@1.0.0',
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
        },
      ],
    });
    const result = executeExactCompile(kernel, req);
    expect(result.representations.map((representation) => representation.semanticOwner)).toEqual([
      'part:revolve',
      'part:loft',
    ]);
    expect(result.meshes.every((mesh) => mesh.triangleCount > 0)).toBe(true);
    expect(result.representations[1]?.topologyElements).toHaveLength(18);
    expect(result.representations[1]?.subElementPaths).toContain(
      'part:loft/profile:loft/face:profile-end',
    );
  });

  it('resolves ordered Boolean operation dependencies', () => {
    const kernel = new InProcessGeometryKernel();
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:boolean',
      pirHash: 'pir:boolean',
      dagHash: 'dag:boolean',
      compilerVersion: 'geometry-contracts@test',
      ops: [
        {
          op: 'geometry.extrude@1.0.0',
          semanticOwner: 'part:left',
          pirOperationId: 'pir:left',
          profile: [
            [0, 0, 0],
            [10, 0, 0],
            [10, 10, 0],
            [0, 10, 0],
          ],
          vector: [0, 0, 10],
          visibility: 'construction',
        },
        {
          op: 'geometry.extrude@1.0.0',
          semanticOwner: 'part:right',
          pirOperationId: 'pir:right',
          profile: [
            [5, 0, 0],
            [15, 0, 0],
            [15, 10, 0],
            [5, 10, 0],
          ],
          vector: [0, 0, 10],
          visibility: 'construction',
        },
        {
          op: 'geometry.boolean@1.0.0',
          semanticOwner: 'part:union',
          pirOperationId: 'pir:union',
          operation: 'union',
          leftOperationId: 'pir:left',
          rightOperationId: 'pir:right',
        },
      ],
    });
    const result = executeExactCompile(kernel, req);
    expect(result.representations).toHaveLength(3);
    expect(result.meshes).toHaveLength(1);
    expect(result.artifactHashes).toHaveLength(1);
    expect(result.representations[2]?.mass.volumeMm3).toBeCloseTo(1500, 6);
  });

  it('resolves plane trim dependencies and hides construction source', () => {
    const kernel = new InProcessGeometryKernel();
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:trim',
      pirHash: 'pir:trim',
      dagHash: 'dag:trim',
      compilerVersion: 'geometry-contracts@test',
      ops: [
        {
          op: 'geometry.extrude@1.0.0',
          semanticOwner: 'part:trim-source',
          pirOperationId: 'pir:trim-source',
          profile: [
            [0, 0, 0],
            [10, 0, 0],
            [10, 10, 0],
            [0, 10, 0],
          ],
          vector: [0, 0, 10],
          visibility: 'construction',
        },
        {
          op: 'geometry.trim-plane@1.0.0',
          semanticOwner: 'part:trimmed',
          pirOperationId: 'pir:trimmed',
          sourceOperationId: 'pir:trim-source',
          planeOrigin: [5, 0, 0],
          planeNormal: [1, 0, 0],
          keep: 'positive',
        },
      ],
    });
    const result = executeExactCompile(kernel, req);
    expect(result.representations).toHaveLength(2);
    expect(result.meshes).toHaveLength(1);
    expect(result.representations[1]?.mass.volumeMm3).toBeCloseTo(500, 6);
  });

  it('resolves semantic edge modifiers with explicit exact approximation', () => {
    const kernel = new InProcessGeometryKernel();
    const edgePath = 'part:source/profile:extrude/edge:rail:0000';
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:edge-modifiers',
      pirHash: 'pir:edge-modifiers',
      dagHash: 'dag:edge-modifiers',
      compilerVersion: 'geometry-contracts@test',
      ops: [
        {
          op: 'geometry.extrude@1.0.0',
          semanticOwner: 'part:source',
          pirOperationId: 'pir:source',
          profile: [
            [0, 0, 0],
            [40, 0, 0],
            [40, 30, 0],
            [0, 30, 0],
          ],
          vector: [0, 0, 20],
          visibility: 'construction',
        },
        {
          op: 'geometry.edge-fillet@1.0.0',
          semanticOwner: 'part:fillet',
          pirOperationId: 'pir:fillet',
          sourceOperationId: 'pir:source',
          edgePaths: [edgePath],
          radiusMm: 4,
        },
        {
          op: 'geometry.edge-chamfer@1.0.0',
          semanticOwner: 'part:chamfer',
          pirOperationId: 'pir:chamfer',
          sourceOperationId: 'pir:source',
          edgePaths: [edgePath],
          distanceMm: 3,
        },
      ],
    });
    const result = executeExactCompile(kernel, req);
    expect(result.representations.slice(1).map((rep) => rep.validationState))
      .toEqual(['geometry-approximated', 'geometry-approximated']);
    expect(result.meshes).toHaveLength(2);
    expect(result.meshes[0]?.maxDeviationMm).toBeGreaterThanOrEqual(4);
    expect(result.meshes[1]?.maxDeviationMm).toBeGreaterThanOrEqual(3);
  });

  it('resolves semantic removed faces with explicit shell approximation', () => {
    const kernel = new InProcessGeometryKernel();
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:face-shell',
      pirHash: 'pir:face-shell',
      dagHash: 'dag:face-shell',
      compilerVersion: 'geometry-contracts@test',
      ops: [
        {
          op: 'geometry.extrude@1.0.0',
          semanticOwner: 'part:shell-source',
          pirOperationId: 'pir:shell-source',
          profile: [
            [0, 0, 0],
            [40, 0, 0],
            [40, 30, 0],
            [0, 30, 0],
          ],
          vector: [0, 0, 20],
          visibility: 'construction',
        },
        {
          op: 'geometry.face-shell@1.0.0',
          semanticOwner: 'part:open-shell',
          pirOperationId: 'pir:open-shell',
          sourceOperationId: 'pir:shell-source',
          removedFacePaths: [
            'part:shell-source/profile:extrude/face:profile-end',
          ],
          thicknessMm: 2,
        },
      ],
    });
    const result = executeExactCompile(kernel, req);
    expect(result.representations[1]?.validationState).toBe(
      'geometry-approximated',
    );
    expect(result.meshes).toHaveLength(1);
    expect(result.meshes[0]?.maxDeviationMm).toBeGreaterThanOrEqual(2);
  });

  it('bounds the exact face-draft approximation from the neutral plane', () => {
    const kernel = new InProcessGeometryKernel();
    const req = parseGeometryCompileRequest({
      snapshotHash: 'snap:face-draft',
      pirHash: 'pir:face-draft',
      dagHash: 'dag:face-draft',
      compilerVersion: 'geometry-contracts@test',
      ops: [
        {
          op: 'geometry.extrude@1.0.0',
          semanticOwner: 'part:draft-source',
          pirOperationId: 'pir:draft-source',
          profile: [
            [0, 0, 0],
            [40, 0, 0],
            [40, 30, 0],
            [0, 30, 0],
          ],
          vector: [0, 0, 20],
          visibility: 'construction',
        },
        {
          op: 'geometry.face-draft@1.0.0',
          semanticOwner: 'part:drafted',
          pirOperationId: 'pir:drafted',
          sourceOperationId: 'pir:draft-source',
          selectedFacePaths: [
            'part:draft-source/profile:extrude/face:side:0000',
          ],
          pullDirection: [0, 0, 1],
          neutralPlaneOrigin: [0, 0, 0],
          neutralPlaneNormal: [0, 0, 1],
          angleDeg: 5,
        },
      ],
    });
    const result = executeExactCompile(kernel, req);
    expect(result.representations[1]?.validationState).toBe(
      'geometry-approximated',
    );
    expect(result.meshes[0]?.maxDeviationMm).toBeCloseTo(
      20 * Math.tan((5 * Math.PI) / 180),
      8,
    );
  });

  it('rejects self-intersecting sweep walls consistently', () => {
    const kernel = new InProcessGeometryKernel();
    expect(() =>
      kernel.sweep({
        semanticOwner: 'component:y:invalid-wall',
        pirOperationId: 'pir:invalid-wall',
        path: [
          [0, 0, 0],
          [100, 0, 0],
        ],
        profileWidthMm: 20,
        profileDepthMm: 40,
        wallThicknessMm: 10,
      }),
    ).toThrow(/SHELL_SELF_INTERSECTION/);
  });
});
