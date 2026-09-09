import { useEffect, useRef, useState } from 'react';
import {
  Color,
  OrthographicCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { DisplayMeshInput } from '../mesh-bridge.js';
import { publicationChromeLabel, type PublicationChrome } from '../viewport.js';
import {
  snapFaceByHitPoint,
  snapNearestEdge,
  snapNearestVertex,
} from '@spds/geometry-contracts/measure';
import type { MeasurePick, MeasureSnapKind, MeasureToolMode } from '../measure-tool.js';
import {
  applyConstraintStatusTint,
  applySelectionHighlight,
  syncFieldOverlay,
  buildDualEngineScene,
  measureLabelReadable,
  measureLabelWorldAnchor,
  meshExtentsFromVertices,
  pickEngineMetaFromIntersection,
  projectWorldToViewportCss,
  setEngineLayerAppearance,
  syncMeasureOverlays,
  resolveViewportBackgroundCss,
  pickSemanticFromIntersection,
  type ConstraintMeshTint,
  type MeasureOverlayInput,
} from './three-scene.js';
import type { FieldInfluenceOverlay } from '@spds/graph-projection';
import { createThickAxesHud, disposeAxesHud } from './viewport-axes.js';
import {
  cameraToViewCubeOrientation,
  faceNameToGimbal,
  fitCameraToObject,
  isClickNotDrag,
  orbitCameraByDelta,
  rotateCameraYaw,
  snapCameraToCorner,
  snapCameraToFace,
  type CubeCornerId,
} from './viewport-controls.js';
import {
  ViewportEngineCompare,
  type EngineLayerState,
} from './ViewportEngineCompare.js';
import { ViewportViewCube } from './ViewportViewCube.js';
import type { HudPosition } from './DraggableHud.js';
import {
  loadViewportPrefs,
  persistEngineLayers,
  persistViewportCamera,
  type PersistedViewportCamera,
} from '../viewport-prefs.js';

/** Match ViewCube column width; sit directly under the ViewCube (top-right). */
const AXES_HUD_PX = 88;
const AXES_HUD_MARGIN = 8;
/** Matches `.spds-viewcube` height (toolbar + stage). */
const VIEWCUBE_STACK_PX = 102;
const AXES_BELOW_CUBE_GAP = 8;

export interface ViewportCanvasProps {
  readonly meshes: readonly DisplayMeshInput[];
  readonly geometryServiceMeshes?: readonly DisplayMeshInput[];
  readonly referenceSourceLabel?: string;
  readonly geometryServiceLabel?: string;
  readonly geometryServiceError?: string;
  readonly chrome?: PublicationChrome;
  readonly selectedSemanticId?: string | null;
  readonly highlightedIds?: readonly string[];
  readonly onPickSemantic?: (semanticId: string) => void;
  readonly onRetryGeometryService?: () => void;
  readonly retryGeometryBusy?: boolean;
  /** When not idle, clicks produce measure picks instead of selection. */
  readonly measureMode?: MeasureToolMode;
  readonly measureSnap?: MeasureSnapKind;
  readonly onMeasurePick?: (pick: MeasurePick, extents: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  }) => void;
  readonly measureOverlays?: readonly MeasureOverlayInput[];
  /** Field influence grid overlay (E1). */
  readonly fieldOverlay?: FieldInfluenceOverlay | null;
  /** Constraint status tints (E2). */
  readonly constraintTints?: readonly ConstraintMeshTint[];
  /** Floating geometry-engine HUD visibility (toggled from the app header). */
  readonly engineHudOpen?: boolean;
  readonly onEngineHudOpenChange?: (open: boolean) => void;
  readonly engineHudPosition?: HudPosition | null;
  readonly onEngineHudPositionChange?: (position: HudPosition) => void;
  /** Fired after local viewport prefs persist (for hosted UI database sync). */
  readonly onViewportPrefsChanged?: () => void;
  /** Custom viewport clear colour (`#rrggbb`); null/undefined uses theme defaults. */
  readonly backgroundHex?: string | null;
}

function readDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

export function ViewportCanvas(props: ViewportCanvasProps) {
  const chrome = props.chrome ?? 'candidate';
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<ReturnType<typeof buildDualEngineScene>['camera'] | null>(null);
  const rootRef = useRef<ReturnType<typeof buildDualEngineScene>['root'] | null>(null);
  const referenceRootRef = useRef<ReturnType<typeof buildDualEngineScene>['referenceRoot'] | null>(
    null,
  );
  const serviceRootRef = useRef<ReturnType<typeof buildDualEngineScene>['geometryServiceRoot']>(
    null,
  );
  const sceneRef = useRef<Scene | null>(null);
  const distanceRef = useRef(500);
  const pickCb = useRef(props.onPickSemantic);
  pickCb.current = props.onPickSemantic;
  const measureModeRef = useRef(props.measureMode ?? 'idle');
  measureModeRef.current = props.measureMode ?? 'idle';
  const measureSnapRef = useRef(props.measureSnap ?? 'vertex');
  measureSnapRef.current = props.measureSnap ?? 'vertex';
  const measurePickCb = useRef(props.onMeasurePick);
  measurePickCb.current = props.onMeasurePick;
  const measureOverlaysRef = useRef(props.measureOverlays ?? []);
  measureOverlaysRef.current = props.measureOverlays ?? [];
  const measureLabelElRef = useRef<HTMLSpanElement | null>(null);
  const meshesRef = useRef(props.meshes);
  meshesRef.current = props.meshes;
  const serviceMeshesRef = useRef(props.geometryServiceMeshes);
  serviceMeshesRef.current = props.geometryServiceMeshes;
  const [picked, setPicked] = useState<string | null>(null);
  const [cubeOrient, setCubeOrient] = useState({ rotX: -28, rotY: 32 });
  const [dark, setDark] = useState(readDarkTheme);
  const serviceAvailable = (props.geometryServiceMeshes?.length ?? 0) > 0;
  const [initialPrefs] = useState(loadViewportPrefs);
  const [referenceLayer, setReferenceLayer] = useState<EngineLayerState>(
    () => initialPrefs.engines.reference,
  );
  const [serviceLayer, setServiceLayer] = useState<EngineLayerState>(
    () => initialPrefs.engines.geometryService,
  );
  const cameraPoseRef = useRef<PersistedViewportCamera | null>(initialPrefs.camera);
  const persistCameraTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onViewportPrefsChangedRef = useRef(props.onViewportPrefsChanged);
  onViewportPrefsChangedRef.current = props.onViewportPrefsChanged;
  const selected = props.selectedSemanticId ?? picked;

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    syncMeasureOverlays(root, props.measureOverlays ?? []);
  }, [props.measureOverlays]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    syncFieldOverlay(root, props.fieldOverlay ?? null);
  }, [props.fieldOverlay, props.meshes, chrome]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.background = new Color(
      resolveViewportBackgroundCss(chrome, dark, props.backgroundHex),
    );
  }, [chrome, dark, props.backgroundHex]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    applySelectionHighlight(
      root,
      props.selectedSemanticId ?? null,
      props.highlightedIds ?? [],
    );
    applyConstraintStatusTint(root, props.constraintTints ?? []);
  }, [
    props.selectedSemanticId,
    props.highlightedIds,
    props.constraintTints,
    props.meshes,
    chrome,
  ]);

  useEffect(() => {
    if (referenceRootRef.current) {
      setEngineLayerAppearance(referenceRootRef.current, referenceLayer);
    }
    if (serviceRootRef.current) {
      setEngineLayerAppearance(serviceRootRef.current, serviceLayer);
    }
  }, [referenceLayer, serviceLayer, props.meshes, props.geometryServiceMeshes]);

  useEffect(() => {
    persistEngineLayers({
      reference: referenceLayer,
      geometryService: serviceLayer,
    });
    onViewportPrefsChangedRef.current?.();
  }, [referenceLayer, serviceLayer]);

  const syncCube = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    setCubeOrient(cameraToViewCubeOrientation(camera, controls.target));
  };

  const captureCameraPose = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const pose: PersistedViewportCamera = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    };
    cameraPoseRef.current = pose;
    if (persistCameraTimerRef.current) clearTimeout(persistCameraTimerRef.current);
    persistCameraTimerRef.current = setTimeout(() => {
      persistViewportCamera(pose);
      onViewportPrefsChangedRef.current?.();
    }, 200);
  };

  const goHome = () => {
    const camera = cameraRef.current;
    const root = rootRef.current;
    const controls = controlsRef.current;
    if (!camera || !root || !controls) return;
    // Disable damping so residual orbit deltas cannot fight the extents fit.
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    const { target, distance } = fitCameraToObject(camera, root);
    distanceRef.current = distance;
    controls.target.copy(target);
    controls.minDistance = Math.max(distance / 50, 0.1);
    controls.maxDistance = Math.max(distance * 40, 100);
    controls.update();
    controls.enableDamping = damping;
    syncCube();
    captureCameraPose();
  };
  const goHomeRef = useRef(goHome);
  goHomeRef.current = goHome;

  const applyFace = (faceName: string) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const target = controls.target.clone();
    distanceRef.current = Math.max(camera.position.distanceTo(target), 1);
    snapCameraToFace(camera, target, faceNameToGimbal(faceName), distanceRef.current);
    controls.update();
    syncCube();
    captureCameraPose();
  };

  const applyCorner = (cornerId: CubeCornerId) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const target = controls.target.clone();
    distanceRef.current = Math.max(camera.position.distanceTo(target), 1);
    snapCameraToCorner(camera, target, cornerId, distanceRef.current);
    controls.update();
    syncCube();
    captureCameraPose();
  };

  const applyYaw = (degrees: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    rotateCameraYaw(camera, controls.target.clone(), degrees);
    controls.update();
    syncCube();
    captureCameraPose();
  };

  const applyOrbitDrag = (deltaX: number, deltaY: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    orbitCameraByDelta(camera, controls.target.clone(), deltaX, deltaY);
    distanceRef.current = Math.max(camera.position.distanceTo(controls.target), 1);
    controls.update();
    syncCube();
    captureCameraPose();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const initialDark = readDarkTheme();
    const built = buildDualEngineScene(
      props.meshes,
      props.geometryServiceMeshes,
      chrome,
      initialDark,
    );
    const { scene, camera, root, referenceRoot, geometryServiceRoot } = built;
    scene.background = new Color(
      resolveViewportBackgroundCss(chrome, initialDark, props.backgroundHex),
    );
    cameraRef.current = camera;
    rootRef.current = root;
    referenceRootRef.current = referenceRoot;
    serviceRootRef.current = geometryServiceRoot;
    sceneRef.current = scene;
    setEngineLayerAppearance(referenceRoot, referenceLayer);
    if (geometryServiceRoot) {
      setEngineLayerAppearance(geometryServiceRoot, serviceLayer);
    }
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.autoClear = false;
    host.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.enablePan = true;
    controlsRef.current = controls;

    const axesScene = new Scene();
    const axesHud = createThickAxesHud();
    axesScene.add(axesHud);
    const axesCam = new OrthographicCamera(-1.75, 1.75, 1.75, -1.75, 0.1, 10);
    const axesOffset = new Vector3();

    const damping0 = controls.enableDamping;
    controls.enableDamping = false;
    const fitted = fitCameraToObject(camera, root);
    const savedPose = cameraPoseRef.current;
    if (savedPose) {
      camera.position.set(
        savedPose.position[0],
        savedPose.position[1],
        savedPose.position[2],
      );
      controls.target.set(savedPose.target[0], savedPose.target[1], savedPose.target[2]);
      const dist = Math.max(camera.position.distanceTo(controls.target), 1);
      distanceRef.current = dist;
      controls.minDistance = Math.max(dist / 50, 0.1);
      controls.maxDistance = Math.max(dist * 40, 100);
      camera.near = Math.max(dist / 100, 0.1);
      camera.far = Math.max(dist * 100, 10000);
      camera.up.set(0, 1, 0);
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
    } else {
      distanceRef.current = fitted.distance;
      controls.target.copy(fitted.target);
      controls.minDistance = Math.max(fitted.distance / 50, 0.1);
      controls.maxDistance = Math.max(fitted.distance * 40, 100);
    }
    controls.update();
    controls.enableDamping = damping0;
    setCubeOrient(cameraToViewCubeOrientation(camera, controls.target));
    const onControlsChange = () => {
      syncCube();
      captureCameraPose();
    };
    controls.addEventListener('change', onControlsChange);

    const resize = () => {
      const w = host.clientWidth || 640;
      const h = host.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    // Causal lens / layout changes shrink the host without a window resize — keep HUD anchored.
    const hostRo =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
    hostRo?.observe(host);

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
      const hits = raycaster.intersectObjects(root.children, true);
      // Prefer the nearest front-facing triangle (DoubleSide + inverted winding otherwise
      // reports the far face via an inward normal).
      const hit =
        hits.find((h) => {
          if (!h.face) return false;
          const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
          return n.dot(raycaster.ray.direction) < -0.02;
        }) ?? hits[0];
      if (!hit) return;

      const measureMode = measureModeRef.current;
      if (measureMode && measureMode !== 'idle') {
        const meta = pickEngineMetaFromIntersection(hit.object.userData);
        if (!meta) return;
        const ownerMeshes = [
          ...meshesRef.current,
          ...(serviceMeshesRef.current ?? []),
        ].filter((m) => m.semanticOwner === meta.semanticId);
        // Prefer the mesh from the same engine layer as the hit when both are present.
        const layerMesh =
          ownerMeshes.find((m) => {
            const k = (m as { kernel?: string }).kernel;
            if (meta.engineLayer === 'reference') return !k || k === 'exact-adapter';
            return Boolean(k && k !== 'exact-adapter');
          }) ?? ownerMeshes[0];
        const verts = layerMesh?.vertices ?? [];
        const extents = meshExtentsFromVertices(verts);
        const hitPt: [number, number, number] = [hit.point.x, hit.point.y, hit.point.z];
        const snap = measureSnapRef.current;
        let featurePath = '';
        let worldPoint: [number, number, number] = hitPt;
        let direction: [number, number, number] | undefined;
        let segment: readonly [[number, number, number], [number, number, number]] | undefined;
        if (snap === 'vertex') {
          const s = snapNearestVertex(meta.semanticId, extents, hitPt);
          featurePath = s.path;
          worldPoint = [...s.position];
        } else if (snap === 'edge') {
          const s = snapNearestEdge(meta.semanticId, extents, hitPt);
          featurePath = s.path;
          worldPoint = [...s.closest];
          direction = [
            s.end[0] - s.start[0],
            s.end[1] - s.start[1],
            s.end[2] - s.start[2],
          ];
          segment = [
            [s.start[0], s.start[1], s.start[2]],
            [s.end[0], s.end[1], s.end[2]],
          ];
        } else {
          // AABB face from hit point plane — not triangle normal (avoids through-pick).
          const s = snapFaceByHitPoint(meta.semanticId, extents, hitPt);
          featurePath = s.path;
          worldPoint = [...s.center];
          direction = [...s.normal];
        }
        measurePickCb.current?.(
          {
            featurePath,
            semanticOwner: meta.semanticId,
            engineLayer: meta.engineLayer,
            kernel: meta.kernel,
            worldPoint,
            snap,
            extents,
            ...(direction !== undefined ? { direction } : {}),
            ...(segment !== undefined ? { segment } : {}),
          },
          extents,
        );
        return;
      }

      const pickedHit = pickSemanticFromIntersection(hit.object.userData);
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
        goHomeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);

    let frame = 0;
    const tick = () => {
      controls.update();
      const w = host.clientWidth || 640;
      const h = host.clientHeight || 400;
      renderer.setViewport(0, 0, w, h);
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.render(scene, camera);

      axesOffset.copy(camera.position).sub(controls.target);
      if (axesOffset.lengthSq() < 1e-8) axesOffset.set(0, 0, 1);
      axesOffset.setLength(2.2);
      axesCam.position.copy(axesOffset);
      axesCam.up.copy(camera.up);
      axesCam.lookAt(0, 0, 0);

      // Top-right, under ViewCube (WebGL y originates at bottom).
      const ax = w - AXES_HUD_PX - AXES_HUD_MARGIN;
      const ay =
        h - AXES_HUD_MARGIN - VIEWCUBE_STACK_PX - AXES_BELOW_CUBE_GAP - AXES_HUD_PX;
      renderer.clearDepth();
      renderer.setScissorTest(true);
      renderer.setScissor(ax, Math.max(ay, 0), AXES_HUD_PX, AXES_HUD_PX);
      renderer.setViewport(ax, Math.max(ay, 0), AXES_HUD_PX, AXES_HUD_PX);
      renderer.render(axesScene, axesCam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);

      const measureEl = measureLabelElRef.current;
      const measureOverlays = measureOverlaysRef.current;
      if (measureEl) {
        const labelOverlay =
          measureOverlays.find(
            (overlay) =>
              overlay.emphasized !== false && measureLabelReadable(overlay.label),
          ) ??
          measureOverlays.find((overlay) => measureLabelReadable(overlay.label)) ??
          null;
        const anchor = labelOverlay ? measureLabelWorldAnchor(labelOverlay) : null;
        if (anchor && labelOverlay) {
          const p = projectWorldToViewportCss(anchor, camera, w, h);
          measureEl.textContent = labelOverlay.label;
          measureEl.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
          measureEl.style.opacity = p.visible ? '1' : '0';
          measureEl.hidden = false;
        } else {
          measureEl.hidden = true;
          measureEl.style.opacity = '0';
        }
      }

      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      controls.removeEventListener('change', onControlsChange);
      if (persistCameraTimerRef.current) {
        clearTimeout(persistCameraTimerRef.current);
        persistCameraTimerRef.current = null;
      }
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      hostRo?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      controls.dispose();
      controlsRef.current = null;
      sceneRef.current = null;
      disposeAxesHud(axesHud);
      renderer.dispose();
      host.replaceChildren();
    };
  }, [props.meshes, props.geometryServiceMeshes, chrome]);

  return (
    <div className="spds-viewport" data-chrome={chrome}>
      <div className="spds-viewport-chrome" aria-live="polite">
        {publicationChromeLabel(chrome)}
        {selected ? ` · selected ${selected}` : ''}
      </div>
      <ViewportEngineCompare
        open={props.engineHudOpen ?? false}
        {...(props.onEngineHudOpenChange !== undefined
          ? { onOpenChange: props.onEngineHudOpenChange }
          : {})}
        {...(props.engineHudPosition !== undefined
          ? { position: props.engineHudPosition }
          : {})}
        {...(props.onEngineHudPositionChange !== undefined
          ? { onPositionChange: props.onEngineHudPositionChange }
          : {})}
        referenceLabel={props.referenceSourceLabel ?? 'Reference pipeline'}
        serviceLabel={props.geometryServiceLabel ?? 'Geometry service'}
        serviceAvailable={serviceAvailable}
        {...(props.geometryServiceError !== undefined
          ? { serviceError: props.geometryServiceError }
          : {})}
        reference={referenceLayer}
        geometryService={serviceLayer}
        onChangeReference={setReferenceLayer}
        onChangeService={setServiceLayer}
        {...(props.onRetryGeometryService !== undefined
          ? { onRetryService: props.onRetryGeometryService }
          : {})}
        {...(props.retryGeometryBusy !== undefined
          ? { retryBusy: props.retryGeometryBusy }
          : {})}
      />
      <ViewportViewCube
        rotX={cubeOrient.rotX}
        rotY={cubeOrient.rotY}
        onFace={applyFace}
        onCorner={applyCorner}
        onRotateYaw={applyYaw}
        onHome={goHome}
        onOrbitDrag={applyOrbitDrag}
      />
      <p className="spds-viewport-hint">LMB orbit · Shift+LMB / RMB pan · wheel zoom · H home</p>
      <span className="spds-measure-label" ref={measureLabelElRef} hidden aria-live="polite" />
      <div className="spds-viewport-canvas" ref={hostRef} />
    </div>
  );
}
