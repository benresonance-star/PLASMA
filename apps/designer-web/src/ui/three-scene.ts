import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  AmbientLight,
  DirectionalLight,
} from 'three';
import type { DisplayMeshInput } from '../mesh-bridge.js';

export interface ScenePickHit {
  readonly meshId: string;
  readonly semanticId: string;
}

/**
 * Build a Three.js scene from display buffers.
 * Mesh userData carries semanticId — never triangle-index identity.
 */
export function buildSceneFromDisplayMeshes(
  meshes: readonly DisplayMeshInput[],
  chrome: 'published' | 'candidate' | 'stale' | 'preview' = 'candidate',
): {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly root: Group;
} {
  const scene = new Scene();
  scene.background = new Color(chrome === 'published' ? 0xf4f6f8 : 0xeef2f7);
  const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
  camera.position.set(400, 300, 500);
  camera.lookAt(0, 0, 0);

  scene.add(new AmbientLight(0xffffff, 0.55));
  const key = new DirectionalLight(0xffffff, 0.85);
  key.position.set(200, 400, 200);
  scene.add(key);

  const root = new Group();
  root.name = 'semantic-display-root';
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
    const material = new MeshStandardMaterial({
      color: chrome === 'published' ? 0x3d7ea6 : 0xc47b3a,
      metalness: 0.15,
      roughness: 0.55,
      side: DoubleSide,
    });
    const mesh = new Mesh(geo, material);
    mesh.name = `mesh:${m.representationId}`;
    mesh.userData = {
      meshId: `mesh:${m.representationId}`,
      semanticId: m.semanticOwner,
      representationId: m.representationId,
    };
    root.add(mesh);
  }
  scene.add(root);
  return { scene, camera, root };
}

export function pickSemanticFromIntersection(userData: unknown): ScenePickHit | null {
  if (!userData || typeof userData !== 'object') return null;
  const data = userData as { meshId?: string; semanticId?: string };
  if (!data.meshId || !data.semanticId) return null;
  return { meshId: data.meshId, semanticId: data.semanticId };
}
