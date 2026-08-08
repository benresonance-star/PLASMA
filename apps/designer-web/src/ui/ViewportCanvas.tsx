import { useEffect, useRef, useState } from 'react';
import { Raycaster, Vector2, WebGLRenderer } from 'three';
import type { DisplayMeshInput } from '../mesh-bridge.js';
import { publicationChromeLabel, type PublicationChrome } from '../viewport.js';
import { buildSceneFromDisplayMeshes, pickSemanticFromIntersection } from './three-scene.js';

export interface ViewportCanvasProps {
  readonly meshes: readonly DisplayMeshInput[];
  readonly chrome?: PublicationChrome;
  readonly onPickSemantic?: (semanticId: string) => void;
}

export function ViewportCanvas(props: ViewportCanvasProps) {
  const chrome = props.chrome ?? 'candidate';
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const { scene, camera, root } = buildSceneFromDisplayMeshes(props.meshes, chrome);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.replaceChildren(renderer.domElement);

    const resize = () => {
      const w = host.clientWidth || 640;
      const h = host.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);
    };
    resize();

    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const onClick = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(root.children, false);
      const hit = hits[0];
      const pickedHit = pickSemanticFromIntersection(hit?.object.userData);
      if (pickedHit) {
        setPicked(pickedHit.semanticId);
        props.onPickSemantic?.(pickedHit.semanticId);
      }
    };
    renderer.domElement.addEventListener('click', onClick);
    window.addEventListener('resize', resize);

    let frame = 0;
    const tick = () => {
      root.rotation.y += 0.003;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener('click', onClick);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      host.replaceChildren();
    };
  }, [props.meshes, chrome, props.onPickSemantic]);

  return (
    <div className="spds-viewport" data-chrome={chrome}>
      <div className="spds-viewport-chrome" aria-live="polite">
        {publicationChromeLabel(chrome)}
        {picked ? ` · selected ${picked}` : ''}
      </div>
      <div className="spds-viewport-canvas" ref={hostRef} />
    </div>
  );
}
