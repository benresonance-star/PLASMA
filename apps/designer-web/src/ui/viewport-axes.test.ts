import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  axisLabelWorldPoint,
  createThickAxesHud,
  disposeAxesHud,
  projectAxesHudToCss,
} from './viewport-axes.js';

describe('viewport-axes', () => {
  it('builds a thick triad with shaft+tip meshes', () => {
    const root = createThickAxesHud();
    expect(root.children.length).toBe(6);
    disposeAxesHud(root);
  });

  it('projects X tip to the right side of a front-facing HUD camera', () => {
    const cam = new OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 10);
    cam.position.set(0, 0, 2.2);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    const tip = axisLabelWorldPoint('x');
    const p = projectAxesHudToCss(tip, cam, 100);
    expect(p.visible).toBe(true);
    expect(p.x).toBeGreaterThan(55);
    expect(p.y).toBeGreaterThan(40);
    expect(p.y).toBeLessThan(60);
  });

  it('keeps label anchors beyond unit length', () => {
    expect(axisLabelWorldPoint('y').distanceTo(new Vector3(0, 0, 0))).toBeGreaterThan(1);
  });

  it('parents letter sprites on the same triad group when canvas is available', () => {
    const g = globalThis as { document?: unknown };
    if (!g.document) {
      const root = createThickAxesHud();
      expect(root.children.length).toBe(6);
      disposeAxesHud(root);
      return;
    }
    const root = createThickAxesHud();
    // 3 shafts + 3 tips + 3 letter sprites
    expect(root.children.length).toBe(9);
    disposeAxesHud(root);
  });
});
