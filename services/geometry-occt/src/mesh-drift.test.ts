import { describe, expect, it } from 'vitest';
import {
  compareDualMeshExtents,
  parseGeometryCompileRequest,
} from '@spds/geometry-contracts';
import { compileMeshesDual } from './compile-meshes.js';
import { OcctNativeKernel } from './occt-native-kernel.js';
import { OcctWasmKernel } from './occt-wasm-kernel.js';

const sampleReq = () =>
  parseGeometryCompileRequest({
    snapshotHash: 'snap:drift',
    pirHash: 'pir:drift',
    dagHash: 'dag:drift',
    compilerVersion: 'drift',
    parameters: { lengthMm: 1200 },
    ops: [
      {
        op: 'geometry.sweep@1.0.0',
        semanticOwner: 'component:y:0000',
        pirOperationId: 'pir:y-brep:component:y:0000',
        path: [
          [0, 0, 0],
          [600, 300, 200],
        ],
        profileWidthMm: 60,
        profileDepthMm: 180,
        wallThicknessMm: 8,
        profileUp: [0, 0, 1],
      },
    ],
  });

const extrusionReq = () =>
  parseGeometryCompileRequest({
    snapshotHash: 'snap:extrusion-drift',
    pirHash: 'pir:extrusion-drift',
    dagHash: 'dag:extrusion-drift',
    compilerVersion: 'drift',
    ops: [
      {
        op: 'geometry.extrude@1.0.0',
        semanticOwner: 'panel:F01:01',
        pirOperationId: 'pir:panel-extrude',
        profile: [
          [0, 0, 0],
          [100, 0, 0],
          [100, 40, 0],
          [40, 40, 0],
          [40, 100, 0],
          [0, 100, 0],
        ],
        vector: [10, 20, 50],
        featurePath: 'panel:shell',
      },
    ],
  });

const revolveLoftReq = () =>
  parseGeometryCompileRequest({
    snapshotHash: 'snap:form-drift',
    pirHash: 'pir:form-drift',
    dagHash: 'dag:form-drift',
    compilerVersion: 'drift',
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
        segments: 64,
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

const booleanReq = () =>
  parseGeometryCompileRequest({
    snapshotHash: 'snap:boolean-drift',
    pirHash: 'pir:boolean-drift',
    dagHash: 'dag:boolean-drift',
    compilerVersion: 'drift',
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
      ...(['union', 'cut', 'intersect'] as const).map((operation) => ({
        op: 'geometry.boolean@1.0.0' as const,
        semanticOwner: `part:${operation}`,
        pirOperationId: `pir:${operation}`,
        operation,
        leftOperationId: 'pir:left',
        rightOperationId: 'pir:right',
      })),
    ],
  });

const trimReq = () =>
  parseGeometryCompileRequest({
    snapshotHash: 'snap:trim-drift',
    pirHash: 'pir:trim-drift',
    dagHash: 'dag:trim-drift',
    compilerVersion: 'drift',
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

const edgeModifierReq = () =>
  parseGeometryCompileRequest({
    snapshotHash: 'snap:modifier-drift',
    pirHash: 'pir:modifier-drift',
    dagHash: 'dag:modifier-drift',
    compilerVersion: 'drift',
    ops: [
      {
        op: 'geometry.extrude@1.0.0',
        semanticOwner: 'part:modifier-source',
        pirOperationId: 'pir:modifier-source',
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
        semanticOwner: 'part:filleted',
        pirOperationId: 'pir:filleted',
        sourceOperationId: 'pir:modifier-source',
        edgePaths: [
          'part:modifier-source/profile:extrude/edge:rail:0000',
        ],
        radiusMm: 4,
      },
      {
        op: 'geometry.edge-chamfer@1.0.0',
        semanticOwner: 'part:chamfered',
        pirOperationId: 'pir:chamfered',
        sourceOperationId: 'pir:modifier-source',
        edgePaths: [
          'part:modifier-source/profile:extrude/edge:rail:0000',
        ],
        distanceMm: 3,
      },
      {
        op: 'geometry.face-shell@1.0.0',
        semanticOwner: 'part:open-shell',
        pirOperationId: 'pir:open-shell',
        sourceOperationId: 'pir:modifier-source',
        removedFacePaths: [
          'part:modifier-source/profile:extrude/face:profile-end',
        ],
        thicknessMm: 2,
        inward: true,
      },
      {
        op: 'geometry.face-draft@1.0.0',
        semanticOwner: 'part:drafted',
        pirOperationId: 'pir:drafted',
        sourceOperationId: 'pir:modifier-source',
        selectedFacePaths: [
          'part:modifier-source/profile:extrude/face:side:0000',
        ],
        pullDirection: [0, 0, 1],
        neutralPlaneOrigin: [0, 0, 0],
        neutralPlaneNormal: [0, 0, 1],
        angleDeg: 5,
        reverse: false,
      },
    ],
  });

describe('K6.2 / N1.8 drift CI gate', () => {
  it('exact vs OCCT WASM: owners align; coarse AABB (STEP-box remapping)', async () => {
    const dual = await compileMeshesDual({
      compile: sampleReq(),
      occtKernel: new OcctWasmKernel(),
    });
    expect(dual.exact.compileHash).toHaveLength(64);
    if (dual.occtError || !dual.occt) {
      expect(dual.occtError?.length).toBeGreaterThan(0);
      return;
    }
    /** STEP-box remapping remains approximate — keep coarse gate. */
    const STEP_TESSELLATE_EXTENT_TOLERANCE_MM = 200;
    const cmp = compareDualMeshExtents(
      dual.exact.meshes,
      dual.occt.meshes,
      STEP_TESSELLATE_EXTENT_TOLERANCE_MM,
    );
    expect(cmp.ownersMatch).toBe(true);
    expect(cmp.ok).toBe(true);
    expect(dual.occt.stepHashes.length).toBe(dual.occt.meshes.length);
  }, 60_000);

  it('exact vs occt-native: owners + oriented extents within 3mm', async () => {
    const native = new OcctNativeKernel();
    await native.ensureReady();
    const dual = await compileMeshesDual({
      compile: sampleReq(),
      nativeKernel: native,
    });
    expect(dual.occtNativeError).toBeUndefined();
    expect(dual.occtNative?.meshes.length).toBe(1);
    expect(dual.exact.compileHash).toHaveLength(64);
    expect(dual.occtNative?.stepHashes.length).toBe(1);
    expect(dual.occtNative?.stepHashes[0]).toHaveLength(64);

    /** N1.8 — native oriented prism matches exact oriented preview extents. */
    const NATIVE_EXTENT_TOLERANCE_MM = 3;
    const cmp = compareDualMeshExtents(
      dual.exact.meshes,
      dual.occtNative!.meshes,
      NATIVE_EXTENT_TOLERANCE_MM,
    );
    expect(cmp.ownersMatch).toBe(true);
    expect(cmp.ok).toBe(true);
    expect(cmp.maxExtentDeltaMm).toBeLessThanOrEqual(NATIVE_EXTENT_TOLERANCE_MM);
    expect(dual.exact.parameters.lengthMm).toBe(1200);
  }, 60_000);

  it('exact vs occt-native: concave extrusion extents conform', async () => {
    const native = new OcctNativeKernel();
    await native.ensureReady();
    const dual = await compileMeshesDual({
      compile: extrusionReq(),
      nativeKernel: native,
    });
    expect(dual.occtNativeError).toBeUndefined();
    expect(
      dual.exact.representations[0]?.topologyElements?.map(
        (element) => element.path,
      ),
    ).toEqual(
      dual.occtNative?.representations[0]?.topologyElements?.map(
        (element) => element.path,
      ),
    );
    const comparison = compareDualMeshExtents(
      dual.exact.meshes,
      dual.occtNative!.meshes,
      3,
    );
    expect(comparison.ownersMatch).toBe(true);
    expect(comparison.ok).toBe(true);
    expect(comparison.maxExtentDeltaMm).toBeLessThanOrEqual(3);
  }, 60_000);

  it('exact vs occt-native: revolve and loft extents conform', async () => {
    const native = new OcctNativeKernel();
    await native.ensureReady();
    const dual = await compileMeshesDual({
      compile: revolveLoftReq(),
      nativeKernel: native,
    });
    expect(dual.occtNativeError).toBeUndefined();
    expect(
      dual.exact.representations[1]?.topologyElements?.map(
        (element) => element.path,
      ),
    ).toEqual(
      dual.occtNative?.representations[1]?.topologyElements?.map(
        (element) => element.path,
      ),
    );
    const comparison = compareDualMeshExtents(
      dual.exact.meshes,
      dual.occtNative!.meshes,
      3,
    );
    expect(comparison.ownersMatch).toBe(true);
    expect(comparison.ok).toBe(true);
    expect(comparison.maxExtentDeltaMm).toBeLessThanOrEqual(3);
  }, 60_000);

  it('exact vs occt-native: dependency-ordered Booleans conform', async () => {
    const native = new OcctNativeKernel();
    await native.ensureReady();
    const dual = await compileMeshesDual({
      compile: booleanReq(),
      nativeKernel: native,
    });
    expect(dual.occtNativeError).toBeUndefined();
    expect(dual.exact.representations).toHaveLength(5);
    expect(dual.exact.meshes).toHaveLength(3);
    expect(dual.occtNative?.meshes).toHaveLength(3);
    const comparison = compareDualMeshExtents(
      dual.exact.meshes,
      dual.occtNative!.meshes,
      0.01,
    );
    expect(comparison.ownersMatch).toBe(true);
    expect(comparison.ok).toBe(true);
  }, 60_000);

  it('exact vs occt-native: dependency-ordered plane trim conforms', async () => {
    const native = new OcctNativeKernel();
    await native.ensureReady();
    const dual = await compileMeshesDual({
      compile: trimReq(),
      nativeKernel: native,
    });
    expect(dual.occtNativeError).toBeUndefined();
    expect(dual.exact.representations).toHaveLength(2);
    expect(dual.exact.meshes).toHaveLength(1);
    expect(dual.occtNative?.meshes).toHaveLength(1);
    const comparison = compareDualMeshExtents(
      dual.exact.meshes,
      dual.occtNative!.meshes,
      0.001,
    );
    expect(comparison.ownersMatch).toBe(true);
    expect(comparison.ok).toBe(true);
  }, 60_000);

  it('exact envelope vs occt-native semantic modifiers conform', async () => {
    const native = new OcctNativeKernel();
    await native.ensureReady();
    const dual = await compileMeshesDual({
      compile: edgeModifierReq(),
      nativeKernel: native,
    });
    expect(dual.occtNativeError).toBeUndefined();
    expect(dual.exact.meshes).toHaveLength(4);
    expect(dual.occtNative?.meshes).toHaveLength(4);
    expect(
      dual.exact.representations.slice(1).map((rep) => rep.validationState),
    ).toEqual([
      'geometry-approximated',
      'geometry-approximated',
      'geometry-approximated',
      'geometry-approximated',
    ]);
    const exactModifierComparison = compareDualMeshExtents(
      dual.exact.meshes.slice(0, 3),
      dual.occtNative!.meshes.slice(0, 3),
      0.001,
    );
    expect(exactModifierComparison.ownersMatch).toBe(true);
    expect(exactModifierComparison.ok).toBe(true);
    const draftEnvelopeComparison = compareDualMeshExtents(
      dual.exact.meshes.slice(3),
      dual.occtNative!.meshes.slice(3),
      20 * Math.tan((5 * Math.PI) / 180) + 0.001,
    );
    expect(draftEnvelopeComparison.ownersMatch).toBe(true);
    expect(draftEnvelopeComparison.ok).toBe(true);
  }, 60_000);
});
