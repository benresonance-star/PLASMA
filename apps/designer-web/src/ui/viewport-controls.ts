/**
 * Viewport camera helpers — fit-to-bbox and CAD-style drag threshold.
 */

import { Box3, Vector3, type PerspectiveCamera, type Object3D } from 'three';

export const PICK_DRAG_THRESHOLD_PX = 4;

export function isClickNotDrag(dx: number, dy: number, threshold = PICK_DRAG_THRESHOLD_PX): boolean {
  return Math.hypot(dx, dy) < threshold;
}

/** Fit perspective camera to object bounds with margin (CAD Home). */
export function fitCameraToObject(
  camera: PerspectiveCamera,
  object: Object3D,
  offset = 1.35,
): { readonly target: Vector3; readonly distance: number } {
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const fitHeightDistance = maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360));
  const fitWidthDistance = fitHeightDistance / Math.max(camera.aspect, 0.1);
  const distance = offset * Math.max(fitHeightDistance, fitWidthDistance);
  const direction = new Vector3(0.65, 0.45, 0.75).normalize();
  camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
  camera.near = Math.max(distance / 100, 0.1);
  camera.far = Math.max(distance * 100, 10000);
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  return { target: center, distance };
}

export type GimbalFace = '+x' | '-x' | '+y' | '-y' | '+z' | '-z' | 'iso';

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
