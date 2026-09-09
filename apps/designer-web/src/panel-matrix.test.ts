import { describe, expect, it } from 'vitest';
import type { PanelId } from './shell.js';
import { rightPaneForPanel, shouldMountViewport } from './right-pane.js';
import { createAppSession, appFocusGeometry, appSetPanel } from './app-session.js';
import { applySelectionHighlight, buildDualEngineScene, setEngineLayerAppearance } from './ui/three-scene.js';
import { Mesh, type MeshStandardMaterial } from 'three';

const PANELS: readonly PanelId[] = [
  'explorer',
  'viewport',
  'inspector',
  'pipeline',
  'validation',
  'history',
  'ai',
  'analysis-mesh',
  'schema',
];

describe('panel hybrid matrix', () => {
  it.each(PANELS)('panel %s maps right pane and mounts viewport', (panel) => {
    const session = appSetPanel(createAppSession(), panel);
    expect(session.g8.shell.activePanel).toBe(panel);
    expect(rightPaneForPanel(panel)).toBeTruthy();
    expect(shouldMountViewport(panel)).toBe(true);
  });

  it('focusGeometry highlights primary and secondary meshes', () => {
    const { root } = buildDualEngineScene(
      [
        {
          representationId: 'r1',
          semanticOwner: 'y:01',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
          indices: [0, 1, 2],
        },
        {
          representationId: 'r2',
          semanticOwner: 'y:02',
          vertices: [
            [2, 0, 0],
            [3, 0, 0],
            [2, 1, 0],
          ],
          indices: [0, 1, 2],
        },
      ],
      undefined,
    );
    let session = createAppSession();
    session = appFocusGeometry(session, ['y:01', 'y:02'], 'inspector', 1);
    expect(session.g8.selection.selectedSemanticId).toBe('y:01');
    expect(session.g8.selection.highlightedIds).toEqual(['y:01', 'y:02']);
    applySelectionHighlight(
      root,
      session.g8.selection.selectedSemanticId,
      session.g8.selection.highlightedIds,
    );
    const meshes = root.children.flatMap((layer) =>
      layer.children.flatMap((p) => p.children.filter((c): c is Mesh => c instanceof Mesh)),
    );
    const primary = meshes.find((m) => m.userData.semanticId === 'y:01')!;
    const secondary = meshes.find((m) => m.userData.semanticId === 'y:02')!;
    expect((primary.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(
      (secondary.material as MeshStandardMaterial).emissiveIntensity,
    );
    expect((secondary.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
  });

  it('engine layer opacity and visibility apply independently', () => {
    const { referenceRoot, geometryServiceRoot } = buildDualEngineScene(
      [
        {
          representationId: 'r1',
          semanticOwner: 'y:01',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
          indices: [0, 1, 2],
        },
      ],
      [
        {
          representationId: 'r1s',
          semanticOwner: 'y:01',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
          indices: [0, 1, 2],
        },
      ],
    );
    expect(geometryServiceRoot).not.toBeNull();
    setEngineLayerAppearance(referenceRoot, { opacity: 0.3, visible: true });
    setEngineLayerAppearance(geometryServiceRoot!, { opacity: 1, visible: false });
    const refMesh = referenceRoot.children[0]!.children.find((c): c is Mesh => c instanceof Mesh)!;
    expect((refMesh.material as MeshStandardMaterial).opacity).toBeCloseTo(0.3);
    expect(geometryServiceRoot!.visible).toBe(false);
  });
});
