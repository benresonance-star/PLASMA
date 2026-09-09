import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, PerspectiveCamera, Scene, Vector3 } from 'three';
import {
  cameraToViewCubeOrientation,
  faceNameToGimbal,
  fitCameraToObject,
  isClickNotDrag,
  listCubeCorners,
  orbitCameraByDelta,
  parseCubeCorner,
  rotateCameraYaw,
  snapCameraToCorner,
  snapCameraToFace,
} from './viewport-controls.js';

describe('viewport-controls', () => {
  it('distinguishes click vs drag by threshold', () => {
    expect(isClickNotDrag(1, 1)).toBe(true);
    expect(isClickNotDrag(10, 0)).toBe(false);
  });

  it('maps Autodesk face names', () => {
    expect(faceNameToGimbal('TOP')).toBe('+y');
    expect(faceNameToGimbal('bottom')).toBe('-y');
    expect(faceNameToGimbal('front')).toBe('+z');
    expect(faceNameToGimbal('left')).toBe('-x');
    expect(faceNameToGimbal('right')).toBe('+x');
  });

  it('fitCameraToObject zooms to extents for the full bounds', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
    const mesh = new Mesh(new BoxGeometry(100, 100, 100));
    const scene = new Scene();
    scene.add(mesh);
    const { distance, target } = fitCameraToObject(camera, mesh);
    expect(distance).toBeGreaterThan(50);
    expect(target.length()).toBeLessThan(1);
    expect(camera.position.distanceTo(target)).toBeCloseTo(distance, 5);
    // Second home after a closer camera still reframes to extents.
    camera.position.set(0, 0, 10);
    const again = fitCameraToObject(camera, mesh);
    expect(again.distance).toBeGreaterThan(50);
    expect(camera.position.distanceTo(again.target)).toBeCloseTo(again.distance, 5);
  });

  it('snapCameraToFace +Z looks toward −Z', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
    const target = new Vector3(0, 0, 0);
    snapCameraToFace(camera, target, '+z', 200);
    expect(camera.position.z).toBeGreaterThan(100);
    const dir = target.clone().sub(camera.position).normalize();
    expect(dir.z).toBeLessThan(-0.9);
  });

  it('cameraToViewCubeOrientation and yaw rotate update pose', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
    const target = new Vector3(0, 0, 0);
    snapCameraToFace(camera, target, 'iso', 200);
    const before = cameraToViewCubeOrientation(camera, target);
    rotateCameraYaw(camera, target, 90);
    const after = cameraToViewCubeOrientation(camera, target);
    expect(Math.abs(after.rotY - before.rotY)).toBeGreaterThan(45);
  });

  it('orbitCameraByDelta can pitch to reveal bottom', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
    const target = new Vector3(0, 0, 0);
    snapCameraToFace(camera, target, '+z', 200);
    expect(camera.position.y).toBeCloseTo(0, 5);
    orbitCameraByDelta(camera, target, 0, 80);
    expect(camera.position.y).toBeLessThan(-20);
    snapCameraToFace(camera, target, '-y', 200);
    expect(camera.position.y).toBeLessThan(-100);
  });

  it('snapCameraToCorner aims along the triad diagonal', () => {
    expect(listCubeCorners()).toHaveLength(8);
    expect(parseCubeCorner('+x+y+z')?.x).toBe(1);
    const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
    const target = new Vector3(0, 0, 0);
    snapCameraToCorner(camera, target, '+x+y+z', 300);
    expect(camera.position.x).toBeGreaterThan(100);
    expect(camera.position.y).toBeGreaterThan(100);
    expect(camera.position.z).toBeGreaterThan(100);
    const dir = target.clone().sub(camera.position).normalize();
    expect(dir.x).toBeCloseTo(-1 / Math.sqrt(3), 5);
    expect(dir.y).toBeCloseTo(-1 / Math.sqrt(3), 5);
    expect(dir.z).toBeCloseTo(-1 / Math.sqrt(3), 5);
  });
});
