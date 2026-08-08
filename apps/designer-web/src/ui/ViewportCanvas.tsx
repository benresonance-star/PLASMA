import { useEffect, useRef, useState } from 'react';
import { Raycaster, Vector2, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { DisplayMeshInput } from '../mesh-bridge.js';
import { publicationChromeLabel, type PublicationChrome } from '../viewport.js';
import { buildSceneFromDisplayMeshes, pickSemanticFromIntersection } from './three-scene.js';
import {
  fitCameraToObject,
  isClickNotDrag,
  snapCameraToFace,
  type GimbalFace,
} from './viewport-controls.js';
import { ViewportGimbal } from './ViewportGimbal.js';

export interface ViewportCanvasProps {
  readonly meshes: readonly DisplayMeshInput[];
  readonly chrome?: PublicationChrome;
  readonly selectedSemanticId?: string | null;
  readonly onPickSemantic?: (semanticId: string) => void;
}

export function ViewportCanvas(props: ViewportCanvasProps) {
  const chrome = props.chrome ?? 'candidate';
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<ReturnType<typeof buildSceneFromDisplayMeshes>['camera'] | null>(null);
  const rootRef = useRef<ReturnType<typeof buildSceneFromDisplayMeshes>['root'] | null>(null);
  const distanceRef = useRef(500);
  const pickCb = useRef(props.onPickSemantic);
  pickCb.current = props.onPickSemantic;
  const [picked, setPicked] = useState<string | null>(null);
  const selected = props.selectedSemanticId ?? picked;

  const goHome = () => {
    const camera = cameraRef.current;
    const root = rootRef.current;
    const controls = controlsRef.current;
    if (!camera || !root || !controls) return;
    const { target, distance } = fitCameraToObject(camera, root);
    distanceRef.current = distance;
    controls.target.copy(target);
    controls.update();
  };

  const onFace = (face: GimbalFace) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    snapCameraToFace(camera, controls.target.clone(), face, distanceRef.current);
    controls.update();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const { scene, camera, root } = buildSceneFromDisplayMeshes(props.meshes, chrome);
    cameraRef.current = camera;
    rootRef.current = root;
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.enablePan = true;
    controlsRef.current = controls;

    const fitted = fitCameraToObject(camera, root);
    distanceRef.current = fitted.distance;
    controls.target.copy(fitted.target);
    controls.minDistance = Math.max(fitted.distance / 50, 1);
    controls.maxDistance = fitted.distance * 40;
    controls.update();

    const resize = () => {
      const w = host.clientWidth || 640;
      const h = host.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();

    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let downX = 0;
    let downY = 0;
    const onPointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (!isClickNotDrag(ev.clientX - downX, ev.clientY - downY)) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(root.children, false);
      const hit = hits[0];
      const pickedHit = pickSemanticFromIntersection(hit?.object.userData);
      if (pickedHit) {
        setPicked(pickedHit.semanticId);
        pickCb.current?.(pickedHit.semanticId);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', resize);

    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (ev.key === 'h' || ev.key === 'H' || ev.key === 'Home') {
        ev.preventDefault();
        const cam = cameraRef.current;
        const rt = rootRef.current;
        const ctl = controlsRef.current;
        if (!cam || !rt || !ctl) return;
        const next = fitCameraToObject(cam, rt);
        distanceRef.current = next.distance;
        ctl.target.copy(next.target);
        ctl.update();
      }
    };
    window.addEventListener('keydown', onKey);

    let frame = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      controls.dispose();
      controlsRef.current = null;
      renderer.dispose();
      host.replaceChildren();
    };
  }, [props.meshes, chrome]);

  return (
    <div className="spds-viewport" data-chrome={chrome}>
      <div className="spds-viewport-chrome" aria-live="polite">
        {publicationChromeLabel(chrome)}
        {selected ? ` · selected ${selected}` : ''}
      </div>
      <ViewportGimbal onFace={onFace} onHome={goHome} />
      <p className="spds-viewport-hint">LMB orbit · Shift+LMB / RMB pan · wheel zoom · H home</p>
      <div className="spds-viewport-canvas" ref={hostRef} />
    </div>
  );
}
