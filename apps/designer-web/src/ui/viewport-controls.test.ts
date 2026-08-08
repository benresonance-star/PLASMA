import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, PerspectiveCamera, Scene } from 'three';
import {
  fitCameraToObject,
  isClickNotDrag,
  snapCameraToFace,
} from './viewport-controls.js';

describe('viewport-controls', () => {
  it('distinguishes click vs drag by threshold', () => {
    expect(isClickNotDrag(1, 1)).toBe(true);
    expect(isClickNotDrag(10, 0)).toBe(false);
  });

  it('fitCameraToObject places mesh inside frustum-friendly distance', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
    const mesh = new Mesh(new BoxGeometry(100, 100, 100));
    const scene = new Scene();
    scene.add(mesh);
    const { distance, target } = fitCameraToObject(camera, mesh);
    expect(distance).toBeGreaterThan(50);
    expect(target.length()).toBeLessThan(1);
    expect(camera.position.distanceTo(target)).toBeGreaterThan(40);
  });

  it('snapCameraToFace +Z looks toward −Z', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
    const target = camera.position.clone().set(0, 0, 0);
    snapCameraToFace(camera, target, '+z', 200);
    expect(camera.position.z).toBeGreaterThan(100);
    const dir = target.clone().sub(camera.position).normalize();
    expect(dir.z).toBeLessThan(-0.9);
  });
});
