/**
 * Viewport camera helpers — fit, ViewCube snaps, Autodesk-style orientation sync.
 */

import {
  Box3,
  Sphere,
  Spherical,
  Vector3,
  type PerspectiveCamera,
  type Object3D,
} from 'three';

export const PICK_DRAG_THRESHOLD_PX = 4;

/** Default ViewCube Home / iso look direction (Three.js Y-up). */
export const HOME_VIEW_DIRECTION = new Vector3(0.65, 0.45, 0.75).normalize();

export function isClickNotDrag(dx: number, dy: number, threshold = PICK_DRAG_THRESHOLD_PX): boolean {
  return Math.hypot(dx, dy) < threshold;
}

/**
 * Zoom camera to object extents (bounding sphere) with margin.
 * Home always uses this so the full model fits the viewport.
 */
export function fitCameraToObject(
  camera: PerspectiveCamera,
  object: Object3D,
  offset = 1.45,
  direction: Vector3 = HOME_VIEW_DIRECTION,
): { readonly target: Vector3; readonly distance: number } {
  object.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(object);
  if (box.isEmpty()) {
    box.setFromCenterAndSize(new Vector3(0, 0, 0), new Vector3(100, 100, 100));
  }
  const sphere = box.getBoundingSphere(new Sphere());
  const center = sphere.center.clone();
  const radius = Math.max(sphere.radius, 1);

  const vFov = (camera.fov * Math.PI) / 180;
  const half = Math.sin(vFov / 2);
  const fitHeightDistance = radius / Math.max(half, 1e-4);
  const fitWidthDistance = fitHeightDistance / Math.max(camera.aspect, 0.1);
  const distance = offset * Math.max(fitHeightDistance, fitWidthDistance);

  const dir = direction.lengthSq() > 1e-8 ? direction.clone().normalize() : HOME_VIEW_DIRECTION.clone();
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(distance / 100, 0.1);
  camera.far = Math.max(distance * 100, 10000);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return { target: center, distance };
}

export type GimbalFace = '+x' | '-x' | '+y' | '-y' | '+z' | '-z' | 'iso';

/** ViewCube corner id — signs for Three.js axes meeting at a vertex. */
export type CubeCornerId =
  | '+x+y+z'
  | '-x+y+z'
  | '+x+y-z'
  | '-x+y-z'
  | '+x-y+z'
  | '-x-y+z'
  | '+x-y-z'
  | '-x-y-z';

export type CubeCorner = {
  readonly id: CubeCornerId;
  readonly x: 1 | -1;
  readonly y: 1 | -1;
  readonly z: 1 | -1;
};

export type CompassCardinal = 'N' | 'E' | 'S' | 'W';

const CUBE_CORNERS: readonly CubeCorner[] = [
  { id: '+x+y+z', x: 1, y: 1, z: 1 },
  { id: '-x+y+z', x: -1, y: 1, z: 1 },
  { id: '+x+y-z', x: 1, y: 1, z: -1 },
  { id: '-x+y-z', x: -1, y: 1, z: -1 },
  { id: '+x-y+z', x: 1, y: -1, z: 1 },
  { id: '-x-y+z', x: -1, y: -1, z: 1 },
  { id: '+x-y-z', x: 1, y: -1, z: -1 },
  { id: '-x-y-z', x: -1, y: -1, z: -1 },
];

export function listCubeCorners(): readonly CubeCorner[] {
  return CUBE_CORNERS;
}

export function parseCubeCorner(id: string): CubeCorner | null {
  return CUBE_CORNERS.find((c) => c.id === id) ?? null;
}

/** Map Autodesk-style face names to camera snap ids (Three.js Y-up). */
export function faceNameToGimbal(face: string): GimbalFace {
  switch (face.toLowerCase()) {
    case 'top':
      return '+y';
    case 'bottom':
      return '-y';
    case 'front':
      return '+z';
    case 'back':
      return '-z';
    case 'right':
      return '+x';
    case 'left':
      return '-x';
    default:
      return 'iso';
  }
}

export function cardinalToGimbal(cardinal: CompassCardinal): GimbalFace {
  switch (cardinal) {
    case 'N':
      return '-z';
    case 'E':
      return '+x';
    case 'S':
      return '+z';
    case 'W':
      return '-x';
  }
}

/** Euler (deg) for CSS 3D ViewCube — mirrors camera orbit around target. */
export function cameraToViewCubeOrientation(
  camera: PerspectiveCamera,
  target: Vector3,
): { readonly rotX: number; readonly rotY: number } {
  const offset = new Vector3().subVectors(camera.position, target);
  const spherical = new Spherical().setFromVector3(offset);
  // CSS rotateX/rotateY: cube faces track world as camera orbits.
  const rotX = ((spherical.phi - Math.PI / 2) * 180) / Math.PI;
  const rotY = (-spherical.theta * 180) / Math.PI;
  return { rotX, rotY };
}

/** Snap camera to orthographic-ish face around target (viewcube). */
export function snapCameraToFace(
  camera: PerspectiveCamera,
  target: Vector3,
  face: GimbalFace,
  distance: number,
): void {
  const d = Math.max(distance, 1);
  const pos = target.clone();
  switch (face) {
    case '+x':
      pos.add(new Vector3(d, 0, 0));
      break;
    case '-x':
      pos.add(new Vector3(-d, 0, 0));
      break;
    case '+y':
      pos.add(new Vector3(0, d, 0));
      break;
    case '-y':
      pos.add(new Vector3(0, -d, 0));
      break;
    case '+z':
      pos.add(new Vector3(0, 0, d));
      break;
    case '-z':
      pos.add(new Vector3(0, 0, -d));
      break;
    case 'iso':
      pos.add(new Vector3(d * 0.65, d * 0.45, d * 0.75));
      break;
  }
  camera.position.copy(pos);
  camera.up.set(0, 1, 0);
  if (face === '+y' || face === '-y') {
    camera.up.set(0, 0, face === '+y' ? -1 : 1);
  }
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

/** Snap camera to a ViewCube corner (isometric triad). */
export function snapCameraToCorner(
  camera: PerspectiveCamera,
  target: Vector3,
  corner: CubeCorner | CubeCornerId,
  distance: number,
): void {
  const resolved = typeof corner === 'string' ? parseCubeCorner(corner) : corner;
  if (!resolved) return;
  const d = Math.max(distance, 1);
  const dir = new Vector3(resolved.x, resolved.y, resolved.z).normalize();
  camera.position.copy(target).addScaledVector(dir, d);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

/** Rotate camera around world +Y by degrees (compass turn). */
export function rotateCameraYaw(
  camera: PerspectiveCamera,
  target: Vector3,
  degrees: number,
): void {
  const offset = new Vector3().subVectors(camera.position, target);
  const rad = (degrees * Math.PI) / 180;
  offset.applyAxisAngle(new Vector3(0, 1, 0), rad);
  camera.position.copy(target).add(offset);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

/**
 * Orbit camera from ViewCube drag deltas (screen px).
 * Drag right → yaw; drag down → pitch toward bottom (matches OrbitControls).
 */
export function orbitCameraByDelta(
  camera: PerspectiveCamera,
  target: Vector3,
  deltaX: number,
  deltaY: number,
  sensitivity = 0.008,
): void {
  const offset = new Vector3().subVectors(camera.position, target);
  const spherical = new Spherical().setFromVector3(offset);
  spherical.theta -= deltaX * sensitivity;
  // Keep a small margin off the poles so the cube stays steerable.
  spherical.phi = Math.min(Math.PI - 0.08, Math.max(0.08, spherical.phi + deltaY * sensitivity));
  spherical.makeSafe();
  offset.setFromSpherical(spherical);
  camera.position.copy(target).add(offset);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}
