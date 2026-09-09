import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  AmbientLight,
  DirectionalLight,
  Vector3,
} from 'three';
import { parseBoxFeaturePath, type FaceKey } from '@spds/geometry-contracts/measure';
import type { FieldInfluenceOverlay } from '@spds/graph-projection';
import type { DisplayMeshInput } from '../mesh-bridge.js';

export interface ScenePickHit {
  readonly meshId: string;
  readonly semanticId: string;
}

const EDGE_COLOR = 0x4a5560;

export type ViewportChrome = 'published' | 'candidate' | 'stale' | 'preview';

/** Scene clear color: mid-gray in dark (Maya-like), soft paper in light. */
export function viewportBackgroundHex(
  chrome: ViewportChrome = 'candidate',
  dark = true,
): number {
  if (!dark) {
    return chrome === 'published' ? 0xe2e8f0 : 0xeef2f6;
  }
  return chrome === 'published' ? 0x5c636a : 0x5a5a5a;
}

/** CSS `#rrggbb` for the theme/chrome default clear colour. */
export function viewportBackgroundCssHex(
  chrome: ViewportChrome = 'candidate',
  dark = true,
): string {
  return `#${viewportBackgroundHex(chrome, dark).toString(16).padStart(6, '0')}`;
}

/** Prefer a custom hex when set; otherwise theme/chrome defaults. */
export function resolveViewportBackgroundCss(
  chrome: ViewportChrome,
  dark: boolean,
  customHex: string | null | undefined,
): string {
  if (typeof customHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(customHex.trim())) {
    return customHex.trim().toLowerCase();
  }
  return viewportBackgroundCssHex(chrome, dark);
}

/**
 * Build a Three.js scene from display buffers.
 * Mesh userData carries semanticId — never triangle-index identity.
 * Faces: white; edges: dark grey (CAD-style).
 */
export function buildSceneFromDisplayMeshes(
  meshes: readonly DisplayMeshInput[],
  chrome: ViewportChrome = 'candidate',
  dark = true,
): {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly root: Group;
} {
  const dual = buildDualEngineScene(meshes, undefined, chrome, dark);
  return { scene: dual.scene, camera: dual.camera, root: dual.root };
}

const SELECT_EMISSIVE = 0xc8782a;
const SELECT_EDGE = 0xe6a23c;
const SECONDARY_EMISSIVE = 0x6b8cae;
const SECONDARY_EDGE = 0x8eb4d4;
const PRIMARY_EMISSIVE_INTENSITY = 0.45;
const SECONDARY_EMISSIVE_INTENSITY = 0.22;

const FACE_TINT_REFERENCE = 0xffffff;
const FACE_TINT_SERVICE = 0xd8e4f0;

export type EngineLayerId = 'reference' | 'geometry-service';

/** Tint meshes: primary selected strongest; other highlightedIds secondary. */
export function applySelectionHighlight(
  root: Group,
  selectedSemanticId: string | null,
  highlightedIds: readonly string[] = [],
): void {
  const highlighted = new Set(highlightedIds);
  root.traverse((obj) => {
    const semanticId =
      obj.userData && typeof obj.userData === 'object'
        ? (obj.userData as { semanticId?: string }).semanticId
        : undefined;
    const isPrimary = Boolean(selectedSemanticId && semanticId === selectedSemanticId);
    const isSecondary = Boolean(
      semanticId && !isPrimary && highlighted.has(semanticId),
    );

    if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial) {
      if (isPrimary) {
        obj.material.emissive.setHex(SELECT_EMISSIVE);
        obj.material.emissiveIntensity = PRIMARY_EMISSIVE_INTENSITY;
      } else if (isSecondary) {
        obj.material.emissive.setHex(SECONDARY_EMISSIVE);
        obj.material.emissiveIntensity = SECONDARY_EMISSIVE_INTENSITY;
      } else {
        obj.material.emissive.setHex(0x000000);
        obj.material.emissiveIntensity = 0;
      }
      obj.material.needsUpdate = true;
    }
    if (obj instanceof LineSegments && obj.material instanceof LineBasicMaterial) {
      if (isPrimary) {
        obj.material.color.setHex(SELECT_EDGE);
      } else if (isSecondary) {
        obj.material.color.setHex(SECONDARY_EDGE);
      } else {
        obj.material.color.setHex(EDGE_COLOR);
      }
      obj.material.needsUpdate = true;
    }
  });
}

/** Apply opacity / visibility to an engine layer group (and its materials). */
export function setEngineLayerAppearance(
  layer: Group,
  options: { readonly opacity: number; readonly visible: boolean },
): void {
  layer.visible = options.visible;
  const opacity = Math.min(1, Math.max(0, options.opacity));
  const transparent = opacity < 0.999;
  layer.traverse((obj) => {
    if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial) {
      obj.material.opacity = opacity;
      obj.material.transparent = transparent;
      obj.material.depthWrite = !transparent;
      obj.material.needsUpdate = true;
    }
    if (obj instanceof LineSegments && obj.material instanceof LineBasicMaterial) {
      obj.material.opacity = opacity;
      obj.material.transparent = transparent;
      obj.material.needsUpdate = true;
    }
  });
}

function appendMeshesToRoot(
  root: Group,
  meshes: readonly DisplayMeshInput[],
  faceColor: number,
  engineLayer: EngineLayerId,
  kernel: string,
): void {
  for (const m of meshes) {
    const geo = new BufferGeometry();
    const positions = new Float32Array(m.vertices.length * 3);
    m.vertices.forEach((v, i) => {
      positions[i * 3] = v[0];
      positions[i * 3 + 1] = v[1];
      positions[i * 3 + 2] = v[2];
    });
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setIndex([...m.indices]);
    geo.computeVertexNormals();

    const part = new Group();
    part.name = `mesh:${m.representationId}`;
    part.userData = {
      meshId: `mesh:${m.representationId}`,
      semanticId: m.semanticOwner,
      representationId: m.representationId,
      engineLayer,
      kernel,
    };

    const faceMat = new MeshStandardMaterial({
      color: faceColor,
      metalness: 0.05,
      roughness: 0.72,
      side: DoubleSide,
      emissive: 0x000000,
      emissiveIntensity: 0,
      transparent: false,
      opacity: 1,
    });
    const edgeMat = new LineBasicMaterial({ color: EDGE_COLOR });

    const mesh = new Mesh(geo, faceMat);
    mesh.userData = part.userData;
    part.add(mesh);

    const edges = new LineSegments(new EdgesGeometry(geo, 20), edgeMat);
    edges.userData = part.userData;
    part.add(edges);

    root.add(part);
  }
}

/**
 * Dual-engine scene: reference + optional geometry-service layers share one camera/world.
 */
export function buildDualEngineScene(
  referenceMeshes: readonly DisplayMeshInput[],
  geometryServiceMeshes: readonly DisplayMeshInput[] | undefined,
  chrome: ViewportChrome = 'candidate',
  dark = true,
): {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly root: Group;
  readonly referenceRoot: Group;
  readonly geometryServiceRoot: Group | null;
} {
  const scene = new Scene();
  scene.background = new Color(viewportBackgroundHex(chrome, dark));
  const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
  camera.position.set(400, 300, 500);
  camera.lookAt(0, 0, 0);

  scene.add(new AmbientLight(0xffffff, 0.7));
  const key = new DirectionalLight(0xffffff, 0.55);
  key.position.set(200, 400, 200);
  scene.add(key);

  const root = new Group();
  root.name = 'semantic-display-root';

  const referenceRoot = new Group();
  referenceRoot.name = 'reference-display-root';
  referenceRoot.userData = { engineLayer: 'reference' satisfies EngineLayerId };
  appendMeshesToRoot(referenceRoot, referenceMeshes, FACE_TINT_REFERENCE, 'reference', 'exact-adapter');
  root.add(referenceRoot);

  let geometryServiceRoot: Group | null = null;
  if (geometryServiceMeshes && geometryServiceMeshes.length > 0) {
    geometryServiceRoot = new Group();
    geometryServiceRoot.name = 'geometry-service-display-root';
    geometryServiceRoot.userData = { engineLayer: 'geometry-service' satisfies EngineLayerId };
    appendMeshesToRoot(
      geometryServiceRoot,
      geometryServiceMeshes,
      FACE_TINT_SERVICE,
      'geometry-service',
      'occt',
    );
    root.add(geometryServiceRoot);
  }

  scene.add(root);
  return { scene, camera, root, referenceRoot, geometryServiceRoot };
}

export function pickSemanticFromIntersection(userData: unknown): ScenePickHit | null {
  if (!userData || typeof userData !== 'object') return null;
  const data = userData as { meshId?: string; semanticId?: string };
  if (!data.meshId || !data.semanticId) return null;
  return { meshId: data.meshId, semanticId: data.semanticId };
}

export interface EnginePickMeta {
  readonly meshId: string;
  readonly semanticId: string;
  readonly representationId?: string;
  readonly engineLayer: EngineLayerId;
  readonly kernel: string;
}

export function pickEngineMetaFromIntersection(userData: unknown): EnginePickMeta | null {
  if (!userData || typeof userData !== 'object') return null;
  const data = userData as {
    meshId?: string;
    semanticId?: string;
    representationId?: string;
    engineLayer?: EngineLayerId;
    kernel?: string;
  };
  if (!data.meshId || !data.semanticId || !data.engineLayer || !data.kernel) return null;
  return {
    meshId: data.meshId,
    semanticId: data.semanticId,
    ...(data.representationId !== undefined ? { representationId: data.representationId } : {}),
    engineLayer: data.engineLayer,
    kernel: data.kernel,
  };
}

/** Axis-aligned extents from display mesh vertices (for measure API). */
export function meshExtentsFromVertices(
  vertices: readonly (readonly [number, number, number])[],
): { min: [number, number, number]; max: [number, number, number] } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v[0]);
    minY = Math.min(minY, v[1]);
    minZ = Math.min(minZ, v[2]);
    maxX = Math.max(maxX, v[0]);
    maxY = Math.max(maxY, v[1]);
    maxZ = Math.max(maxZ, v[2]);
  }
  if (!Number.isFinite(minX)) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export interface MeasureAngleViz {
  readonly apex: readonly [number, number, number];
  /** Geometry-fixed radial arm endpoints (on edges / in faces). */
  readonly tipA: readonly [number, number, number];
  readonly tipB: readonly [number, number, number];
  /** Arc radius in mm (derived from arm length, fixed to geometry). */
  readonly radiusMm: number;
  readonly kind: 'edge' | 'face';
}

export interface MeasureFaceHighlight {
  readonly featurePath: string;
  readonly extents: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  /** First pick = primary (strong); second pick = secondary (softer). */
  readonly role?: 'primary' | 'secondary';
}

export interface MeasureEdgeHighlight {
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly role?: 'primary' | 'secondary';
}

export interface MeasureOverlayInput {
  readonly kind: 'distance' | 'edgeLength' | 'faceArea' | 'angle';
  readonly points: readonly (readonly [number, number, number])[];
  /** For angle: two direction vectors. */
  readonly directions?: readonly (readonly [number, number, number])[];
  readonly label: string;
  /** Face area / angle face–face highlights. */
  readonly faceHighlight?: MeasureFaceHighlight;
  readonly faceHighlights?: readonly MeasureFaceHighlight[];
  /** Angle edge–edge highlights (full picked edges). */
  readonly edgeHighlights?: readonly MeasureEdgeHighlight[];
  /** Preferred angle diagram (apex + radial tips). When set, overrides points/directions. */
  readonly angleViz?: MeasureAngleViz;
  /** Selected / draft overlay — stronger styling + preferred label. */
  readonly emphasized?: boolean;
}
const MEASURE_OVERLAY_NAME = 'measure-overlay';
const MEASURE_COLOR = 0xffb020;
const MEASURE_COLOR_SECONDARY = 0x6ec8ff;
const MEASURE_MARKER_R = 22;
const MEASURE_LINE_R = 5;

function disposeMeasureObject(obj: Group | Mesh | Line | LineSegments): void {
  obj.traverse((child) => {
    if (child instanceof Mesh || child instanceof Line || child instanceof LineSegments) {
      child.geometry.dispose();
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}

function measureMarkerMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: MEASURE_COLOR,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 1,
  });
}

function fatSegment(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  radius: number,
  material: MeshBasicMaterial,
): Mesh {
  const start = new Vector3(a[0], a[1], a[2]);
  const end = new Vector3(b[0], b[1], b[2]);
  const dir = new Vector3().subVectors(end, start);
  const len = dir.length();
  const mesh = new Mesh(new CylinderGeometry(radius, radius, Math.max(len, 0.01), 10), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  if (len > 1e-8) {
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  }
  mesh.renderOrder = 10;
  return mesh;
}

/**
 * Build a CAD-style angle diagram for two AABB faces or two edges.
 * Face–face: apex on the shared edge; radials lie in each face (dihedral).
 * Edge–edge: apex at shared vertex when present, else first edge mid; radials along edges.
 */
export function buildAngleViz(input: {
  readonly snap: 'face' | 'edge';
  readonly pathA: string;
  readonly pathB: string;
  readonly extents: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly segmentA?: readonly [readonly [number, number, number], readonly [number, number, number]];
  readonly segmentB?: readonly [readonly [number, number, number], readonly [number, number, number]];
}): MeasureAngleViz | null {
  const { min, max } = input.extents;
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1);

  if (input.snap === 'face') {
    const a = parseBoxFeaturePath(input.pathA);
    const b = parseBoxFeaturePath(input.pathB);
    if (!a || !b || a.kind !== 'face' || b.kind !== 'face') return null;
    const fa = a.id as FaceKey;
    const fb = b.id as FaceKey;
    // Arc radius from face spans (geometry-fixed, not camera-scaled).
    const spanA = faceSpanMm(fa, input.extents);
    const spanB = faceSpanMm(fb, input.extents);
    const radiusMm = Math.min(160, Math.max(36, Math.min(spanA, spanB) * 0.35));
    const shared = sharedAabbEdge(fa, fb, input.extents);
    if (!shared) {
      // Parallel faces — fall back to box center with face normals.
      const apex: [number, number, number] = [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ];
      return {
        apex,
        tipA: tipFromApex(apex, faceNormal(fa), radiusMm),
        tipB: tipFromApex(apex, faceNormal(fb), radiusMm),
        radiusMm,
        kind: 'face',
      };
    }
    // Apex at the shared-edge corner (hinge end0) — stays on solid geometry.
    const apex = shared.hinge[0];
    return {
      apex,
      tipA: tipFromApex(apex, shared.dirA, radiusMm),
      tipB: tipFromApex(apex, shared.dirB, radiusMm),
      radiusMm,
      kind: 'face',
    };
  }

  // Edge–edge: radials lie on the picked edges; tips are geometry points along each edge.
  const segA = input.segmentA;
  const segB = input.segmentB;
  if (!segA || !segB) return null;
  const apex = sharedEdgeVertex(segA, segB) ?? midpoint3(segA[0], segA[1]);
  const tipA = farPointOnSegment(apex, segA);
  const tipB = farPointOnSegment(apex, segB);
  const armA = Math.hypot(tipA[0] - apex[0], tipA[1] - apex[1], tipA[2] - apex[2]);
  const armB = Math.hypot(tipB[0] - apex[0], tipB[1] - apex[1], tipB[2] - apex[2]);
  const radiusMm = Math.min(160, Math.max(36, Math.min(armA, armB, size * 0.25) * 0.45));
  return {
    apex,
    tipA: tipFromApex(apex, sub3(tipA, apex), radiusMm),
    tipB: tipFromApex(apex, sub3(tipB, apex), radiusMm),
    radiusMm,
    kind: 'edge',
  };
}

function faceNormal(key: FaceKey): readonly [number, number, number] {
  switch (key) {
    case '+x':
      return [1, 0, 0];
    case '-x':
      return [-1, 0, 0];
    case '+y':
      return [0, 1, 0];
    case '-y':
      return [0, -1, 0];
    case '+z':
      return [0, 0, 1];
    case '-z':
      return [0, 0, -1];
    default: {
      const _never: never = key;
      throw new Error(`unknown face ${_never}`);
    }
  }
}

/** Shared AABB edge between two faces + in-face radial directions from edge midpoint. */
function sharedAabbEdge(
  fa: FaceKey,
  fb: FaceKey,
  extents: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  },
): {
  apex: readonly [number, number, number];
  dirA: readonly [number, number, number];
  dirB: readonly [number, number, number];
  hinge: readonly [readonly [number, number, number], readonly [number, number, number]];
} | null {
  const { min, max } = extents;
  const axisOf = (k: FaceKey): 0 | 1 | 2 => (k.includes('x') ? 0 : k.includes('y') ? 1 : 2);
  if (axisOf(fa) === axisOf(fb)) return null; // parallel

  const coord = (k: FaceKey): number => {
    if (k === '+x') return max[0];
    if (k === '-x') return min[0];
    if (k === '+y') return max[1];
    if (k === '-y') return min[1];
    if (k === '+z') return max[2];
    return min[2];
  };

  const free = ([0, 1, 2] as const).find((i) => i !== axisOf(fa) && i !== axisOf(fb))!;
  const end0: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  end0[axisOf(fa)] = coord(fa);
  end0[axisOf(fb)] = coord(fb);
  end0[free] = min[free];
  const end1: [number, number, number] = [end0[0], end0[1], end0[2]];
  end1[free] = max[free];

  const apex = midpoint3(end0, end1);

  // In-face radials from the shared edge toward each face interior.
  // For AABB: into face A from the edge is −normal(B).
  const na = faceNormal(fa);
  const nb = faceNormal(fb);
  const dirA = normalize3([-nb[0], -nb[1], -nb[2]]);
  const dirB = normalize3([-na[0], -na[1], -na[2]]);
  return { apex, dirA, dirB, hinge: [end0, end1] };
}

function faceSpanMm(
  key: FaceKey,
  extents: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  },
): number {
  const { min, max } = extents;
  const dx = max[0] - min[0];
  const dy = max[1] - min[1];
  const dz = max[2] - min[2];
  switch (key) {
    case '+x':
    case '-x':
      return Math.min(dy, dz);
    case '+y':
    case '-y':
      return Math.min(dx, dz);
    case '+z':
    case '-z':
      return Math.min(dx, dy);
    default: {
      const _never: never = key;
      throw new Error(`unknown face ${_never}`);
    }
  }
}

function tipFromApex(
  apex: readonly [number, number, number],
  dir: readonly [number, number, number],
  radiusMm: number,
): [number, number, number] {
  const d = normalize3(dir);
  return [apex[0] + d[0] * radiusMm, apex[1] + d[1] * radiusMm, apex[2] + d[2] * radiusMm];
}

function farPointOnSegment(
  apex: readonly [number, number, number],
  seg: readonly [readonly [number, number, number], readonly [number, number, number]],
): readonly [number, number, number] {
  const d0 = Math.hypot(seg[0][0] - apex[0], seg[0][1] - apex[1], seg[0][2] - apex[2]);
  const d1 = Math.hypot(seg[1][0] - apex[0], seg[1][1] - apex[1], seg[1][2] - apex[2]);
  return d1 >= d0 ? seg[1] : seg[0];
}

function sub3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function midpoint3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function normalize3(v: readonly [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-12) return [1, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function sharedEdgeVertex(
  a: readonly [readonly [number, number, number], readonly [number, number, number]],
  b: readonly [readonly [number, number, number], readonly [number, number, number]],
): [number, number, number] | null {
  const pts = [a[0], a[1], b[0], b[1]];
  for (let i = 0; i < 2; i++) {
    for (let j = 2; j < 4; j++) {
      const p = pts[i]!;
      const q = pts[j]!;
      if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-3) {
        return [p[0], p[1], p[2]];
      }
    }
  }
  return null;
}

/** World-space point for the screen-projected measure value label. */
export function measureLabelWorldAnchor(
  overlay: MeasureOverlayInput,
): readonly [number, number, number] | null {
  if (overlay.kind === 'angle') {
    const viz = overlay.angleViz;
    if (viz) {
      const u = new Vector3(
        viz.tipA[0] - viz.apex[0],
        viz.tipA[1] - viz.apex[1],
        viz.tipA[2] - viz.apex[2],
      ).normalize();
      const v = new Vector3(
        viz.tipB[0] - viz.apex[0],
        viz.tipB[1] - viz.apex[1],
        viz.tipB[2] - viz.apex[2],
      ).normalize();
      // Place label outside the measured wedge so the arc stays clear.
      const mid = new Vector3().copy(u).add(v);
      if (mid.lengthSq() < 1e-10) {
        // 180° — offset with a perpendicular
        mid.crossVectors(u, new Vector3(0, 0, 1));
        if (mid.lengthSq() < 1e-10) mid.crossVectors(u, new Vector3(0, 1, 0));
      }
      mid.normalize().multiplyScalar(-1);
      const r = viz.radiusMm * 1.45;
      return [
        viz.apex[0] + mid.x * r,
        viz.apex[1] + mid.y * r,
        viz.apex[2] + mid.z * r,
      ];
    }
  }
  if (overlay.points.length === 0) return null;
  if (
    (overlay.kind === 'distance' || overlay.kind === 'edgeLength') &&
    overlay.points.length >= 2
  ) {
    const a = overlay.points[0]!;
    const b = overlay.points[1]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  }
  if (overlay.kind === 'angle' && overlay.directions && overlay.directions.length >= 2) {
    const origin = overlay.points[0] ?? ([0, 0, 0] as const);
    const d0 = overlay.directions[0]!;
    const d1 = overlay.directions[1]!;
    const u = new Vector3(d0[0], d0[1], d0[2]).normalize();
    const v = new Vector3(d1[0], d1[1], d1[2]).normalize();
    const mid = new Vector3().copy(u).add(v).normalize();
    const radius = 90;
    return [
      origin[0] + mid.x * (radius * 1.05),
      origin[1] + mid.y * (radius * 1.05),
      origin[2] + mid.z * (radius * 1.05),
    ];
  }
  const p = overlay.points[0]!;
  return [p[0], p[1], p[2]];
}

/** Project a world point through the main camera to CSS pixels inside the viewport host. */
export function projectWorldToViewportCss(
  world: readonly [number, number, number],
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): { readonly x: number; readonly y: number; readonly visible: boolean } {
  const v = new Vector3(world[0], world[1], world[2]).project(camera);
  const visible = v.z >= -1 && v.z <= 1 && Math.abs(v.x) <= 1.2 && Math.abs(v.y) <= 1.2;
  return {
    x: (v.x * 0.5 + 0.5) * viewportWidth,
    y: (-v.y * 0.5 + 0.5) * viewportHeight,
    visible,
  };
}

export function measureLabelReadable(label: string): boolean {
  return (
    Boolean(label) &&
    (/\d/.test(label) || label.includes('mm') || label.includes('deg')) &&
    !label.includes('404') &&
    !label.startsWith('Distance:') &&
    !label.startsWith('Angle:') &&
    !label.startsWith('Edge:') &&
    !label.startsWith('Face:')
  );
}

/** Four corners of an AABB box face (slightly inflated along the outward normal). */
export function boxFaceCorners(
  extents: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  },
  faceKey: FaceKey,
  inflateMm = 1.5,
): readonly (readonly [number, number, number])[] {
  const { min, max } = extents;
  switch (faceKey) {
    case '+x': {
      const x = max[0] + inflateMm;
      return [
        [x, min[1], min[2]],
        [x, max[1], min[2]],
        [x, max[1], max[2]],
        [x, min[1], max[2]],
      ];
    }
    case '-x': {
      const x = min[0] - inflateMm;
      return [
        [x, min[1], min[2]],
        [x, min[1], max[2]],
        [x, max[1], max[2]],
        [x, max[1], min[2]],
      ];
    }
    case '+y': {
      const y = max[1] + inflateMm;
      return [
        [min[0], y, min[2]],
        [min[0], y, max[2]],
        [max[0], y, max[2]],
        [max[0], y, min[2]],
      ];
    }
    case '-y': {
      const y = min[1] - inflateMm;
      return [
        [min[0], y, min[2]],
        [max[0], y, min[2]],
        [max[0], y, max[2]],
        [min[0], y, max[2]],
      ];
    }
    case '+z': {
      const z = max[2] + inflateMm;
      return [
        [min[0], min[1], z],
        [max[0], min[1], z],
        [max[0], max[1], z],
        [min[0], max[1], z],
      ];
    }
    case '-z': {
      const z = min[2] - inflateMm;
      return [
        [min[0], min[1], z],
        [min[0], max[1], z],
        [max[0], max[1], z],
        [max[0], min[1], z],
      ];
    }
    default: {
      const _never: never = faceKey;
      throw new Error(`unknown face ${_never}`);
    }
  }
}

function measureAccentMaterial(color: number, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity,
  });
}

function addFaceHighlight(
  group: Group,
  extents: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  },
  featurePath: string,
  role: 'primary' | 'secondary' = 'primary',
): void {
  const parsed = parseBoxFeaturePath(featurePath);
  if (!parsed || parsed.kind !== 'face') return;
  const faceKey = parsed.id as FaceKey;
  if (!['+x', '-x', '+y', '-y', '+z', '-z'].includes(faceKey)) return;
  const corners = boxFaceCorners(extents, faceKey);
  const positions = new Float32Array(12);
  corners.forEach((c, i) => {
    positions[i * 3] = c[0];
    positions[i * 3 + 1] = c[1];
    positions[i * 3 + 2] = c[2];
  });
  const color = role === 'primary' ? MEASURE_COLOR : MEASURE_COLOR_SECONDARY;
  const fillOpacity = role === 'primary' ? 0.48 : 0.22;
  const outlineR = role === 'primary' ? MEASURE_LINE_R * 1.05 : MEASURE_LINE_R * 0.7;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  const fill = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: fillOpacity,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geo, fill);
  mesh.renderOrder = role === 'primary' ? 9 : 8;
  group.add(mesh);

  const edgeGeo = new BufferGeometry();
  edgeGeo.setAttribute('position', new BufferAttribute(positions, 3));
  edgeGeo.setIndex([0, 1, 1, 2, 2, 3, 3, 0]);
  const edgeMat = new LineBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    linewidth: 2,
  });
  const edges = new LineSegments(edgeGeo, edgeMat);
  edges.renderOrder = 10;
  group.add(edges);

  // Fat outline for visibility (WebGL linewidth is often ignored).
  const outlineMat = measureAccentMaterial(color);
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    group.add(fatSegment(a, b, outlineR, outlineMat));
  }
}

function addEdgeHighlight(
  group: Group,
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  role: 'primary' | 'secondary' = 'primary',
): void {
  const color = role === 'primary' ? MEASURE_COLOR : MEASURE_COLOR_SECONDARY;
  const mat = measureAccentMaterial(color);
  const lineR = role === 'primary' ? MEASURE_LINE_R * 1.35 : MEASURE_LINE_R * 1.0;
  group.add(fatSegment(start, end, lineR, mat));
  const sphere = new SphereGeometry(
    role === 'primary' ? MEASURE_MARKER_R * 0.9 : MEASURE_MARKER_R * 0.7,
    12,
    12,
  );
  for (const p of [start, end]) {
    const m = new Mesh(sphere, mat);
    m.position.set(p[0], p[1], p[2]);
    m.renderOrder = 11;
    group.add(m);
  }
}

function addAngleDiagram(group: Group, viz: MeasureAngleViz): void {
  const markerMat = measureMarkerMaterial();
  const lineMat = measureMarkerMaterial();
  const armR = Math.max(MEASURE_LINE_R * 1.35, viz.radiusMm * 0.035);
  const sphere = new SphereGeometry(Math.max(MEASURE_MARKER_R, viz.radiusMm * 0.08), 16, 16);
  const apex = viz.apex;
  const tipA: [number, number, number] = [viz.tipA[0], viz.tipA[1], viz.tipA[2]];
  const tipB: [number, number, number] = [viz.tipB[0], viz.tipB[1], viz.tipB[2]];
  const u = new Vector3(tipA[0] - apex[0], tipA[1] - apex[1], tipA[2] - apex[2]).normalize();
  const v = new Vector3(tipB[0] - apex[0], tipB[1] - apex[1], tipB[2] - apex[2]).normalize();
  const radius = viz.radiusMm;

  // True circular arc in the plane of u,v (rotation about u×v).
  let axis = new Vector3().crossVectors(u, v);
  if (axis.lengthSq() < 1e-10) {
    axis = new Vector3().crossVectors(u, new Vector3(0, 0, 1));
    if (axis.lengthSq() < 1e-10) axis = new Vector3().crossVectors(u, new Vector3(0, 1, 0));
  }
  axis.normalize();
  const cos = Math.min(1, Math.max(-1, u.dot(v)));
  const angle = Math.acos(cos);
  const segs = Math.max(20, Math.ceil((angle * 180) / Math.PI) + 8);

  // Filled wedge (highly visible from any foreshortened view).
  const fanCount = segs + 2;
  const fanPos = new Float32Array(fanCount * 3);
  fanPos[0] = apex[0];
  fanPos[1] = apex[1];
  fanPos[2] = apex[2];
  for (let i = 0; i <= segs; i++) {
    const d = u.clone().applyAxisAngle(axis, (angle * i) / segs).normalize();
    const o = (i + 1) * 3;
    fanPos[o] = apex[0] + d.x * radius;
    fanPos[o + 1] = apex[1] + d.y * radius;
    fanPos[o + 2] = apex[2] + d.z * radius;
  }
  const fanIdx: number[] = [];
  for (let i = 1; i <= segs; i++) {
    fanIdx.push(0, i, i + 1);
  }
  const fanGeo = new BufferGeometry();
  fanGeo.setAttribute('position', new BufferAttribute(fanPos, 3));
  fanGeo.setIndex(fanIdx);
  const wedge = new Mesh(
    fanGeo,
    new MeshBasicMaterial({
      color: MEASURE_COLOR,
      transparent: true,
      opacity: 0.38,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  wedge.renderOrder = 8;
  group.add(wedge);

  // Apex + arm tips
  for (const p of [apex, tipA, tipB]) {
    const m = new Mesh(sphere, markerMat);
    m.position.set(p[0], p[1], p[2]);
    m.renderOrder = 12;
    group.add(m);
  }

  // Radial arms (thick) — tips are geometry-fixed.
  group.add(fatSegment(apex as [number, number, number], tipA, armR, lineMat));
  group.add(fatSegment(apex as [number, number, number], tipB, armR, lineMat));

  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const d0 = u.clone().applyAxisAngle(axis, angle * t0).normalize();
    const d1 = u.clone().applyAxisAngle(axis, angle * t1).normalize();
    const p0: [number, number, number] = [
      apex[0] + d0.x * radius,
      apex[1] + d0.y * radius,
      apex[2] + d0.z * radius,
    ];
    const p1: [number, number, number] = [
      apex[0] + d1.x * radius,
      apex[1] + d1.y * radius,
      apex[2] + d1.z * radius,
    ];
    group.add(fatSegment(p0, p1, armR * 0.85, lineMat));
  }
}

function appendMeasureOverlayGraphics(
  group: Group,
  overlay: MeasureOverlayInput,
): void {
  const emphasized = overlay.emphasized !== false;
  const markerMat = emphasized
    ? measureMarkerMaterial()
    : measureAccentMaterial(MEASURE_COLOR_SECONDARY, 0.75);
  const lineMat = emphasized
    ? measureMarkerMaterial()
    : measureAccentMaterial(MEASURE_COLOR_SECONDARY, 0.75);
  const markerR = emphasized ? MEASURE_MARKER_R : MEASURE_MARKER_R * 0.7;
  const lineR = emphasized ? MEASURE_LINE_R : MEASURE_LINE_R * 0.7;
  const sphere = new SphereGeometry(markerR, 16, 16);

  const faceHighlights =
    overlay.faceHighlights ??
    (overlay.faceHighlight ? [overlay.faceHighlight] : []);
  for (const face of faceHighlights) {
    addFaceHighlight(
      group,
      face.extents,
      face.featurePath,
      emphasized ? (face.role ?? 'primary') : 'secondary',
    );
  }
  for (const edge of overlay.edgeHighlights ?? []) {
    addEdgeHighlight(
      group,
      edge.start,
      edge.end,
      emphasized ? (edge.role ?? 'primary') : 'secondary',
    );
  }

  if (overlay.kind === 'angle' && overlay.angleViz) {
    addAngleDiagram(group, overlay.angleViz);
  } else if (overlay.kind !== 'angle' && faceHighlights.length === 0) {
    for (const p of overlay.points) {
      const m = new Mesh(sphere, markerMat);
      m.position.set(p[0], p[1], p[2]);
      m.renderOrder = 11;
      group.add(m);
    }
  }

  if (
    (overlay.kind === 'distance' || overlay.kind === 'edgeLength') &&
    overlay.points.length >= 2
  ) {
    const a = overlay.points[0]!;
    const b = overlay.points[1]!;
    group.add(fatSegment(a, b, lineR, lineMat));
  }

  if (
    overlay.kind === 'angle' &&
    !overlay.angleViz &&
    overlay.directions &&
    overlay.directions.length >= 2
  ) {
    const origin = overlay.points[0] ?? ([0, 0, 0] as const);
    const radiusMm = 90;
    addAngleDiagram(group, {
      apex: origin,
      tipA: tipFromApex(origin, overlay.directions[0]!, radiusMm),
      tipB: tipFromApex(origin, overlay.directions[1]!, radiusMm),
      radiusMm,
      kind: 'edge',
    });
  }
}

/** Replace measure overlay group under scene root (markers + fat line/arc). Label is HTML/CSS. */
export function syncMeasureOverlay(root: Group, overlay: MeasureOverlayInput | null): void {
  syncMeasureOverlays(root, overlay ? [overlay] : []);
}

/** Sync one or more measure overlays; label prefers the first emphasized readable label. */
export function syncMeasureOverlays(
  root: Group,
  overlays: readonly MeasureOverlayInput[],
): void {
  const prev = root.getObjectByName(MEASURE_OVERLAY_NAME);
  if (prev) {
    root.remove(prev);
    disposeMeasureObject(prev as Group);
  }
  const usable = overlays.filter((overlay) => {
    if (overlay.kind === 'angle') {
      return Boolean(overlay.angleViz) || overlay.points.length > 0 || Boolean(overlay.directions);
    }
    return overlay.points.length > 0 || Boolean(overlay.faceHighlight) || Boolean(overlay.faceHighlights?.length);
  });
  if (usable.length === 0) return;

  const group = new Group();
  group.name = MEASURE_OVERLAY_NAME;
  let labelOverlay: MeasureOverlayInput | null = null;
  for (const overlay of usable) {
    const child = new Group();
    appendMeasureOverlayGraphics(child, overlay);
    group.add(child);
    if (
      !labelOverlay &&
      overlay.emphasized !== false &&
      measureLabelReadable(overlay.label)
    ) {
      labelOverlay = overlay;
    }
  }
  if (!labelOverlay) {
    labelOverlay = usable.find((o) => measureLabelReadable(o.label)) ?? usable[0] ?? null;
  }
  const anchor = labelOverlay ? measureLabelWorldAnchor(labelOverlay) : null;
  group.userData = {
    measureLabel: labelOverlay?.label ?? '',
    labelAnchor: anchor,
  };
  root.add(group);
}

const FIELD_OVERLAY_NAME = 'field-influence-overlay';

function disposeObjectTree(obj: Group | Mesh): void {
  obj.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}

/** Build / replace a 64² field influence plane under the scene root (E1b/E1c). */
export function syncFieldOverlay(
  root: Group,
  overlay: FieldInfluenceOverlay | null,
  worldSizeMm = 2400,
): void {
  const prev = root.getObjectByName(FIELD_OVERLAY_NAME);
  if (prev) {
    root.remove(prev);
    disposeObjectTree(prev as Group);
  }
  if (!overlay) return;

  const w = overlay.width;
  const h = overlay.height;
  const geom = new PlaneGeometry(worldSizeMm, worldSizeMm, w - 1, h - 1);
  geom.rotateX(-Math.PI / 2);
  const colours = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i += 1) {
    const t = overlay.values[i] ?? 0;
    // Cool → warm ramp (finite, stable for tests).
    colours[i * 3] = 0.15 + t * 0.75;
    colours[i * 3 + 1] = 0.35 + t * 0.25;
    colours[i * 3 + 2] = 0.85 - t * 0.55;
  }
  geom.setAttribute('color', new BufferAttribute(colours, 3));
  const mat = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geom, mat);
  mesh.name = FIELD_OVERLAY_NAME;
  mesh.position.y = 2;
  mesh.userData = {
    kind: 'field-overlay',
    fieldId: overlay.fieldId,
    sampleGridSize: overlay.sampleGridSize,
  };
  root.add(mesh);
}

export function fieldOverlayPresent(root: Group): boolean {
  return Boolean(root.getObjectByName(FIELD_OVERLAY_NAME));
}

export type ConstraintMeshTint = {
  readonly semanticId: string;
  readonly colour: string;
  readonly glyph: string;
  readonly label: string;
  readonly status: string;
};

const CONSTRAINT_GLYPH_NAME = 'constraint-status-glyphs';

/** Tint owner meshes by constraint status + attach non-colour glyph sprites (E2b/E2c). */
export function applyConstraintStatusTint(
  root: Group,
  tints: readonly ConstraintMeshTint[],
): void {
  const byId = new Map(tints.map((t) => [t.semanticId, t]));
  const prevGlyphs = root.getObjectByName(CONSTRAINT_GLYPH_NAME);
  if (prevGlyphs) {
    root.remove(prevGlyphs);
    disposeObjectTree(prevGlyphs as Group);
  }
  const glyphGroup = new Group();
  glyphGroup.name = CONSTRAINT_GLYPH_NAME;

  root.traverse((obj) => {
    const semanticId =
      obj.userData && typeof obj.userData === 'object'
        ? (obj.userData as { semanticId?: string }).semanticId
        : undefined;
    if (!semanticId || !(obj instanceof Mesh) || !(obj.material instanceof MeshStandardMaterial)) {
      return;
    }
    const tint = byId.get(semanticId);
    if (!tint) {
      if (obj.userData.constraintTintApplied) {
        obj.material.emissive.setHex(0x000000);
        obj.material.emissiveIntensity = 0;
        delete obj.userData.constraintTintApplied;
        delete obj.userData.constraintGlyph;
        delete obj.userData.constraintStatus;
      }
      return;
    }
    const colour = new Color(tint.colour);
    obj.material.emissive.copy(colour);
    obj.material.emissiveIntensity = 0.35;
    obj.material.needsUpdate = true;
    obj.userData.constraintTintApplied = true;
    obj.userData.constraintGlyph = tint.glyph;
    obj.userData.constraintStatus = tint.status;
    obj.userData.constraintLabel = tint.label;

    // Lightweight world marker (sphere) — glyph/label live on userData for a11y HUD.
    const marker = new Mesh(
      new SphereGeometry(18, 8, 8),
      new MeshBasicMaterial({ color: colour }),
    );
    marker.position.copy(obj.position);
    marker.position.y += 40;
    marker.userData = {
      constraintGlyph: tint.glyph,
      constraintLabel: `${tint.glyph} ${tint.label}`,
      semanticId,
    };
    glyphGroup.add(marker);
  });

  if (glyphGroup.children.length > 0) root.add(glyphGroup);
}

export function clearConstraintStatusTint(root: Group): void {
  applyConstraintStatusTint(root, []);
}
