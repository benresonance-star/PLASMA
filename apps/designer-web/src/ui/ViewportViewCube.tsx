import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { isClickNotDrag, type CubeCornerId } from './viewport-controls.js';

type CubePointerEvent = ReactPointerEvent<HTMLElement>;

type CubeHit =
  | { readonly kind: 'face'; readonly id: string }
  | { readonly kind: 'corner'; readonly id: CubeCornerId };

export interface ViewportViewCubeProps {
  readonly rotX: number;
  readonly rotY: number;
  readonly onFace: (faceName: string) => void;
  readonly onCorner: (cornerId: CubeCornerId) => void;
  readonly onRotateYaw: (degrees: number) => void;
  readonly onHome: () => void;
  /** Drag the cube to orbit the main camera (px deltas). */
  readonly onOrbitDrag: (deltaX: number, deltaY: number) => void;
}

const FACE_HALF = 26;

const CORNER_SLOTS = ['tl', 'tr', 'br', 'bl'] as const;
type CornerSlot = (typeof CORNER_SLOTS)[number];

/**
 * Face-local corner order: top-left, top-right, bottom-right, bottom-left.
 * Mapped to Three.js Y-up world corners for CSS cube face transforms.
 */
const FACE_CORNERS: Record<
  'top' | 'bottom' | 'front' | 'back' | 'right' | 'left',
  readonly [CubeCornerId, CubeCornerId, CubeCornerId, CubeCornerId]
> = {
  front: ['-x+y+z', '+x+y+z', '+x-y+z', '-x-y+z'],
  back: ['+x+y-z', '-x+y-z', '-x-y-z', '+x-y-z'],
  right: ['+x+y+z', '+x+y-z', '+x-y-z', '+x-y+z'],
  left: ['-x+y-z', '-x+y+z', '-x-y+z', '-x-y-z'],
  top: ['-x+y-z', '+x+y-z', '+x+y+z', '-x+y+z'],
  bottom: ['-x-y+z', '+x-y+z', '+x-y-z', '-x-y-z'],
};

const FACES = [
  {
    name: 'top' as const,
    label: 'TOP',
    transform: `rotateX(90deg) translateZ(${FACE_HALF}px)`,
  },
  {
    name: 'bottom' as const,
    label: 'BOTTOM',
    transform: `rotateX(-90deg) translateZ(${FACE_HALF}px)`,
  },
  {
    name: 'front' as const,
    label: 'FRONT',
    transform: `translateZ(${FACE_HALF}px)`,
  },
  {
    name: 'back' as const,
    label: 'BACK',
    transform: `rotateY(180deg) translateZ(${FACE_HALF}px)`,
  },
  {
    name: 'right' as const,
    label: 'RIGHT',
    transform: `rotateY(90deg) translateZ(${FACE_HALF}px)`,
  },
  {
    name: 'left' as const,
    label: 'LEFT',
    transform: `rotateY(-90deg) translateZ(${FACE_HALF}px)`,
  },
];

function cornerLabel(id: CubeCornerId): string {
  const parts: string[] = [];
  if (id.includes('+y')) parts.push('Top');
  if (id.includes('-y')) parts.push('Bottom');
  if (id.includes('+z')) parts.push('Front');
  if (id.includes('-z')) parts.push('Back');
  if (id.includes('+x')) parts.push('Right');
  if (id.includes('-x')) parts.push('Left');
  return parts.join('-');
}

/**
 * Autodesk-style ViewCube navigator (top-right viewport HUD).
 * Drag to orbit; click a face or highlighted corner to snap.
 */
export function ViewportViewCube(props: ViewportViewCubeProps) {
  const dragRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    originX: number;
    originY: number;
    dragged: boolean;
    hit: CubeHit | null;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Shared hover for the three face wedges that meet at one vertex. */
  const [hotCorner, setHotCorner] = useState<CubeCornerId | null>(null);

  const endDrag = (ev: CubePointerEvent, commitHit: boolean) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== ev.pointerId) return;
    try {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    dragRef.current = null;
    setDragging(false);
    if (!commitHit || state.dragged || !state.hit) return;
    if (state.hit.kind === 'face') props.onFace(state.hit.id);
    else props.onCorner(state.hit.id);
  };

  const onCubePointerDown = (ev: CubePointerEvent, hit: CubeHit | null) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragRef.current = {
      pointerId: ev.pointerId,
      lastX: ev.clientX,
      lastY: ev.clientY,
      originX: ev.clientX,
      originY: ev.clientY,
      dragged: false,
      hit,
    };
    setDragging(true);
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const onCubePointerMove = (ev: CubePointerEvent) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== ev.pointerId) return;
    const dx = ev.clientX - state.lastX;
    const dy = ev.clientY - state.lastY;
    state.lastX = ev.clientX;
    state.lastY = ev.clientY;
    if (!state.dragged) {
      state.dragged = !isClickNotDrag(ev.clientX - state.originX, ev.clientY - state.originY);
    }
    if (state.dragged && (dx !== 0 || dy !== 0)) {
      props.onOrbitDrag(dx, dy);
    }
  };

  return (
    <div className="spds-viewcube" aria-label="View navigation" role="toolbar">
      <div className="spds-viewcube-toolbar">
        <button
          type="button"
          className="spds-viewcube-home"
          aria-label="Home — zoom to extents"
          title="Home — zoom to extents"
          onClick={props.onHome}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 3.2 3.5 10.2v10.1h5.7v-5.5h5.6v5.5h5.7V10.2L12 3.2z"
            />
          </svg>
        </button>

        <div className="spds-viewcube-turns">
          <button
            type="button"
            className="spds-viewcube-turn spds-viewcube-turn-ccw"
            aria-label="Rotate view counter-clockwise"
            title="Rotate −90°"
            onClick={() => props.onRotateYaw(-90)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                d="M7 8a7 7 0 1 1-1.2 8.2"
              />
              <path fill="currentColor" d="M7 4.5 3.8 9.2 9.5 9z" />
            </svg>
          </button>
          <button
            type="button"
            className="spds-viewcube-turn spds-viewcube-turn-cw"
            aria-label="Rotate view clockwise"
            title="Rotate +90°"
            onClick={() => props.onRotateYaw(90)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                d="M17 8a7 7 0 1 0 1.2 8.2"
              />
              <path fill="currentColor" d="M17 4.5 20.2 9.2 14.5 9z" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className={`spds-viewcube-stage${dragging ? ' is-dragging' : ''}`}
        onPointerDown={(ev) => onCubePointerDown(ev, null)}
        onPointerMove={onCubePointerMove}
        onPointerUp={(ev) => endDrag(ev, false)}
        onPointerCancel={(ev) => endDrag(ev, false)}
      >
        <div
          className="spds-viewcube-cube"
          style={{
            transform: `rotateX(${props.rotX}deg) rotateY(${props.rotY}deg)`,
          }}
        >
          {FACES.map((f) => (
            <div
              key={f.name}
              className={`spds-viewcube-face spds-viewcube-face-${f.name}`}
              style={{ transform: f.transform }}
            >
              <button
                type="button"
                className="spds-viewcube-face-hit"
                aria-label={`View ${f.label}`}
                title={f.label}
                onPointerDown={(ev) => onCubePointerDown(ev, { kind: 'face', id: f.name })}
                onPointerMove={onCubePointerMove}
                onPointerUp={(ev) => endDrag(ev, true)}
                onPointerCancel={(ev) => endDrag(ev, false)}
              >
                {f.label}
              </button>
              {CORNER_SLOTS.map((slot, i) => {
                const cornerId = FACE_CORNERS[f.name][i]!;
                const label = cornerLabel(cornerId);
                const isHot = hotCorner === cornerId;
                return (
                  <button
                    key={slot}
                    type="button"
                    data-corner={cornerId}
                    className={`spds-viewcube-corner spds-viewcube-corner-${slot as CornerSlot}${isHot ? ' is-hot' : ''}`}
                    aria-label={`View ${label}`}
                    title={label}
                    onPointerEnter={() => setHotCorner(cornerId)}
                    onPointerLeave={(ev) => {
                      const next = ev.relatedTarget;
                      if (
                        next instanceof Element &&
                        next.closest(`[data-corner="${cornerId}"]`)
                      ) {
                        return;
                      }
                      setHotCorner((cur) => (cur === cornerId ? null : cur));
                    }}
                    onPointerDown={(ev) =>
                      onCubePointerDown(ev, { kind: 'corner', id: cornerId })
                    }
                    onPointerMove={onCubePointerMove}
                    onPointerUp={(ev) => endDrag(ev, true)}
                    onPointerCancel={(ev) => endDrag(ev, false)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
