import { describe, expect, it } from 'vitest';
import { Mesh, PerspectiveCamera, type MeshStandardMaterial } from 'three';
import { projectFieldInfluence } from '@spds/graph-projection';
import {
  applyConstraintStatusTint,
  applySelectionHighlight,
  boxFaceCorners,
  buildAngleViz,
  buildSceneFromDisplayMeshes,
  fieldOverlayPresent,
  measureLabelWorldAnchor,
  pickSemanticFromIntersection,
  projectWorldToViewportCss,
  syncFieldOverlay,
  syncMeasureOverlay,
} from './three-scene.js';

describe('S3 Three.js viewport scene', () => {
  it('attaches semantic ids to mesh userData (not triangle indices)', () => {
    const { root } = buildSceneFromDisplayMeshes(
      [
        {
          representationId: 'repr:1',
          semanticOwner: 'y:01',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
          indices: [0, 1, 2],
        },
      ],
      'candidate',
    );
    const layer = root.children[0]!;
    const part = layer.children[0]!;
    expect(part.userData.semanticId).toBe('y:01');
    expect(part.userData.meshId).toBe('mesh:repr:1');
    expect(pickSemanticFromIntersection(part.userData)?.semanticId).toBe('y:01');
    expect(part.children.length).toBe(2); // face mesh + edge lines
  });

  it('highlights the selected semantic mesh in the viewport', () => {
    const { root } = buildSceneFromDisplayMeshes(
      [
        {
          representationId: 'repr:1',
          semanticOwner: 'y:01',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
          indices: [0, 1, 2],
        },
        {
          representationId: 'repr:2',
          semanticOwner: 'y:02',
          vertices: [
            [2, 0, 0],
            [3, 0, 0],
            [2, 1, 0],
          ],
          indices: [0, 1, 2],
        },
      ],
      'candidate',
    );
    applySelectionHighlight(root, 'y:02');
    const meshes = root.children.flatMap((layer) =>
      layer.children.flatMap((p) => p.children.filter((c): c is Mesh => c instanceof Mesh)),
    );
    const selected = meshes.find((m) => m.userData.semanticId === 'y:02')!;
    const other = meshes.find((m) => m.userData.semanticId === 'y:01')!;
    expect((selected.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
    expect((other.material as MeshStandardMaterial).emissiveIntensity).toBe(0);
    applySelectionHighlight(root, null);
    expect((selected.material as MeshStandardMaterial).emissiveIntensity).toBe(0);
  });

  it('projects measure label anchors to screen space (camera-facing HUD)', () => {
    const anchor = measureLabelWorldAnchor({
      kind: 'distance',
      points: [
        [0, 0, 0],
        [100, 0, 0],
      ],
      label: '100.00 mm',
    });
    expect(anchor).toEqual([50, 0, 0]);
    const cam = new PerspectiveCamera(50, 1, 0.1, 10000);
    cam.position.set(50, 50, 200);
    cam.lookAt(50, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const p = projectWorldToViewportCss(anchor!, cam, 800, 600);
    expect(p.visible).toBe(true);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(800);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(600);
  });

  it('builds face-face angle viz fixed to geometry with tips in faces', () => {
    const extents = { min: [0, 0, 0] as const, max: [100, 60, 40] as const };
    const viz = buildAngleViz({
      snap: 'face',
      pathA: 'semantic:y:1/box/face:+x',
      pathB: 'semantic:y:1/box/face:+y',
      extents,
    });
    expect(viz).toBeTruthy();
    expect(viz!.kind).toBe('face');
    // Apex on shared edge corner (geometry), not pulled toward camera.
    expect(viz!.apex[0]).toBeCloseTo(100, 5);
    expect(viz!.apex[1]).toBeCloseTo(60, 5);
    expect(viz!.apex[2]).toBeCloseTo(0, 5);
    // Tips lie in each face from that corner.
    expect(viz!.tipA[0]).toBeCloseTo(100, 5);
    expect(viz!.tipA[1]).toBeLessThan(60);
    expect(viz!.tipB[1]).toBeCloseTo(60, 5);
    expect(viz!.tipB[0]).toBeLessThan(100);
    const label = measureLabelWorldAnchor({
      kind: 'angle',
      points: [],
      label: '90.00 deg',
      angleViz: viz!,
    });
    expect(label).toBeTruthy();
    const distApex = Math.hypot(
      label![0] - viz!.apex[0],
      label![1] - viz!.apex[1],
      label![2] - viz!.apex[2],
    );
    // Outside the measured wedge, past the arc so the arc stays readable.
    expect(distApex).toBeGreaterThan(viz!.radiusMm * 1.3);
    expect(distApex).toBeLessThan(viz!.radiusMm * 1.7);
    // Exterior of +x/+y corner: label sits outside the solid, not in the wedge.
    expect(label![0]).toBeGreaterThan(viz!.apex[0]);
    expect(label![1]).toBeGreaterThan(viz!.apex[1]);
  });

  it('builds edge-edge angle viz along edge geometry', () => {
    const extents = { min: [0, 0, 0] as const, max: [100, 60, 40] as const };
    const viz = buildAngleViz({
      snap: 'edge',
      pathA: 'semantic:y:1/box/edge:0',
      pathB: 'semantic:y:1/box/edge:1',
      extents,
      segmentA: [
        [0, 0, 0],
        [100, 0, 0],
      ],
      segmentB: [
        [0, 0, 0],
        [0, 60, 0],
      ],
    });
    expect(viz).toBeTruthy();
    expect(viz!.kind).toBe('edge');
    expect(viz!.apex).toEqual([0, 0, 0]);
    expect(viz!.tipA[0]).toBeGreaterThan(0);
    expect(viz!.tipA[1]).toBeCloseTo(0, 5);
    expect(viz!.tipB[1]).toBeGreaterThan(0);
    expect(viz!.tipB[0]).toBeCloseTo(0, 5);
  });

  it('highlights both faces for face-face angle overlay', () => {
    const extents = { min: [0, 0, 0] as const, max: [100, 60, 40] as const };
    const { root } = buildSceneFromDisplayMeshes(
      [
        {
          representationId: 'repr:1',
          semanticOwner: 'component:y:1',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
          indices: [0, 1, 2],
        },
      ],
      'candidate',
    );
    const viz = buildAngleViz({
      snap: 'face',
      pathA: 'semantic:y:1/box/face:+x',
      pathB: 'semantic:y:1/box/face:+y',
      extents,
    })!;
    syncMeasureOverlay(root, {
      kind: 'angle',
      points: [],
      label: '90.00 deg',
      angleViz: viz,
      faceHighlights: [
        { featurePath: 'semantic:y:1/box/face:+x', extents, role: 'primary' },
        { featurePath: 'semantic:y:1/box/face:+y', extents, role: 'secondary' },
      ],
    });
    const overlay = root.getObjectByName('measure-overlay');
    expect(overlay).toBeTruthy();
    // Each overlay is wrapped in a child group with face fills + outlines + angle diagram.
    let graphics = 0;
    overlay!.traverse(() => {
      graphics += 1;
    });
    expect(graphics).toBeGreaterThan(10);
  });

  it('highlights measured face with overlay geometry', () => {
    const extents = { min: [0, -30, -90] as const, max: [1000, 30, 90] as const };
    const corners = boxFaceCorners(extents, '+y');
    expect(corners).toHaveLength(4);
    expect(corners.every((c) => c[1] > 30)).toBe(true);

    const { root } = buildSceneFromDisplayMeshes(
      [
        {
          representationId: 'repr:1',
          semanticOwner: 'component:y:1',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
          indices: [0, 1, 2],
        },
      ],
      'candidate',
    );
    syncMeasureOverlay(root, {
      kind: 'faceArea',
      points: [[500, 30, 0]],
      label: '180000.0 mm²',
      faceHighlight: {
        featurePath: 'semantic:component:y:1/box/face:+y',
        extents,
      },
    });
    const overlay = root.getObjectByName('measure-overlay');
    expect(overlay).toBeTruthy();
    let graphics = 0;
    overlay!.traverse(() => {
      graphics += 1;
    });
    expect(graphics).toBeGreaterThan(2);
  });

  it('E1b/E1c: field overlay create/update/dispose within budget', () => {
    const { root } = buildSceneFromDisplayMeshes(
      [
        {
          representationId: 'repr:1',
          semanticOwner: 'component:y:1',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
          indices: [0, 1, 2],
        },
      ],
      'candidate',
    );
    const influence = projectFieldInfluence('field:d01:distance', ['component:y:1']);
    const t0 = performance.now();
    syncFieldOverlay(root, influence.overlay);
    expect(performance.now() - t0).toBeLessThan(33);
    expect(fieldOverlayPresent(root)).toBe(true);

    const t1 = performance.now();
    syncFieldOverlay(root, influence.overlay);
    expect(performance.now() - t1).toBeLessThan(33);
    expect(root.children.filter((c) => c.name === 'field-influence-overlay')).toHaveLength(1);

    syncFieldOverlay(root, null);
    expect(fieldOverlayPresent(root)).toBe(false);
  });

  it('E2b/E2c: constraint tint applies colour + glyph userData', () => {
    const { root } = buildSceneFromDisplayMeshes(
      [
        {
          representationId: 'repr:1',
          semanticOwner: 'y:01',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
          indices: [0, 1, 2],
        },
        {
          representationId: 'repr:2',
          semanticOwner: 'y:02',
          vertices: [
            [2, 0, 0],
            [3, 0, 0],
            [2, 1, 0],
          ],
          indices: [0, 1, 2],
        },
      ],
      'candidate',
    );
    const t0 = performance.now();
    applyConstraintStatusTint(root, [
      {
        semanticId: 'y:01',
        colour: '#3d9a5f',
        glyph: '○',
        label: 'safe',
        status: 'safe',
      },
      {
        semanticId: 'y:02',
        colour: '#c23b22',
        glyph: '●',
        label: 'violating',
        status: 'violating',
      },
    ]);
    expect(performance.now() - t0).toBeLessThan(20);

    const meshes = root.children.flatMap((layer) =>
      layer.children.flatMap((p) => p.children.filter((c): c is Mesh => c instanceof Mesh)),
    );
    const a = meshes.find((m) => m.userData.semanticId === 'y:01')!;
    const b = meshes.find((m) => m.userData.semanticId === 'y:02')!;
    expect(a.userData.constraintGlyph).toBe('○');
    expect(b.userData.constraintGlyph).toBe('●');
    expect((a.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);

    applyConstraintStatusTint(root, []);
    expect(a.userData.constraintGlyph).toBeUndefined();
  });
});
