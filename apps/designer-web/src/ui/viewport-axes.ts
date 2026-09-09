import {
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
} from 'three';

export const AXES_ARM_LENGTH = 1;
/** Thick enough to read RGB at HUD scale. */
export const AXES_ARM_RADIUS = 0.07;
export const AXES_TIP_RADIUS = 0.12;
export const AXES_TIP_LENGTH = 0.22;
/** Label sits just past the cone tip, locked in the same Group as the arrows. */
export const AXES_LABEL_OFFSET = 0.38;
export const AXES_LABEL_SCALE = 0.42;

const AXIS_DEFS = [
  { key: 'x' as const, dir: new Vector3(1, 0, 0), color: 0xe74c3c, css: '#e74c3c' },
  { key: 'y' as const, dir: new Vector3(0, 1, 0), color: 0x2ecc71, css: '#2ecc71' },
  { key: 'z' as const, dir: new Vector3(0, 0, 1), color: 0x3498db, css: '#3498db' },
] as const;

export type AxisKey = (typeof AXIS_DEFS)[number]['key'];

const Y_UP = new Vector3(0, 1, 0);

function createAxisLetterSprite(letter: string, cssColor: string): Sprite | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  ctx.font = '700 44px "Segoe UI", "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.lineWidth = 7;
  ctx.strokeText(letter, size / 2, size / 2 + 1);
  ctx.fillStyle = cssColor;
  ctx.fillText(letter, size / 2, size / 2 + 1);
  const map = new CanvasTexture(canvas);
  map.needsUpdate = true;
  const mat = new SpriteMaterial({
    map,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const sprite = new Sprite(mat);
  sprite.scale.setScalar(AXES_LABEL_SCALE);
  sprite.name = `axis-label-${letter}`;
  return sprite;
}

/** Thick RGB triad for the viewport corner HUD (replaces thin AxesHelper). */
export function createThickAxesHud(
  length = AXES_ARM_LENGTH,
  radius = AXES_ARM_RADIUS,
): Group {
  const root = new Group();
  root.name = 'axes-hud';

  for (const axis of AXIS_DEFS) {
    const mat = new MeshBasicMaterial({ color: axis.color });
    const shaftLen = Math.max(length - AXES_TIP_LENGTH * 0.55, length * 0.65);
    const shaft = new Mesh(new CylinderGeometry(radius, radius, shaftLen, 12), mat);
    shaft.quaternion.setFromUnitVectors(Y_UP, axis.dir);
    shaft.position.copy(axis.dir).multiplyScalar(shaftLen / 2);
    root.add(shaft);

    const tip = new Mesh(new ConeGeometry(AXES_TIP_RADIUS, AXES_TIP_LENGTH, 12), mat);
    tip.quaternion.setFromUnitVectors(Y_UP, axis.dir);
    tip.position.copy(axis.dir).multiplyScalar(shaftLen + AXES_TIP_LENGTH / 2 - 0.02);
    root.add(tip);

    const label = createAxisLetterSprite(axis.key.toUpperCase(), axis.css);
    if (label) {
      label.position.copy(axis.dir).multiplyScalar(length + AXES_LABEL_OFFSET);
      root.add(label);
    }
  }

  return root;
}

/** World-space label anchor beyond the arrow tip (clear of the cone). */
export function axisLabelWorldPoint(key: AxisKey, length = AXES_ARM_LENGTH): Vector3 {
  const axis = AXIS_DEFS.find((a) => a.key === key)!;
  return axis.dir.clone().multiplyScalar(length + AXES_LABEL_OFFSET);
}

/** Project an axes-HUD world point into CSS px inside a square HUD of `sizePx`. */
export function projectAxesHudToCss(
  world: Vector3,
  camera: Camera,
  sizePx: number,
): { readonly x: number; readonly y: number; readonly visible: boolean } {
  const ndc = world.clone().project(camera);
  const x = (ndc.x * 0.5 + 0.5) * sizePx;
  const y = (-ndc.y * 0.5 + 0.5) * sizePx;
  const visible = ndc.z > -1 && ndc.z < 1;
  return { x, y, visible };
}

export function disposeAxesHud(root: Group): void {
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
      return;
    }
    if (obj instanceof Sprite) {
      const mat = obj.material;
      mat.map?.dispose();
      mat.dispose();
    }
  });
}
