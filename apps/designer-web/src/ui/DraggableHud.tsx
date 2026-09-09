import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { GripVertical, X } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { cn } from '../lib/utils.js';

export interface HudPosition {
  readonly x: number;
  readonly y: number;
}

export interface DraggableHudProps {
  readonly title: string;
  readonly open: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly defaultPosition: HudPosition;
  /** Restored / controlled position. When set, skips defaultAnchor placement. */
  readonly position?: HudPosition | null;
  readonly onPositionChange?: (position: HudPosition) => void;
  /** When set, place the HUD once against the parent edge on first open. */
  readonly defaultAnchor?: 'top-left' | 'top-right';
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly children: ReactNode;
  readonly testId?: string;
}

/**
 * Floating viewport HUD with a drag handle. Position is CSS left/top inside a
 * positioned ancestor (typically the viewport panel).
 */
export function DraggableHud(props: DraggableHudProps) {
  const [pos, setPos] = useState<HudPosition>(
    () => props.position ?? props.defaultPosition,
  );
  const posRef = useRef(pos);
  posRef.current = pos;
  const anchoredRef = useRef(Boolean(props.position));
  const dragRef = useRef<{
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly originX: number;
    readonly originY: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onPositionChangeRef = useRef(props.onPositionChange);
  onPositionChangeRef.current = props.onPositionChange;

  useEffect(() => {
    if (!props.position) return;
    posRef.current = props.position;
    setPos(props.position);
    anchoredRef.current = true;
  }, [props.position?.x, props.position?.y]);

  useLayoutEffect(() => {
    if (!props.open) {
      dragRef.current = null;
      return;
    }
    if (anchoredRef.current || props.defaultAnchor !== 'top-right' || props.position) {
      return;
    }
    const el = panelRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    anchoredRef.current = true;
    const next = {
      x: Math.max(8, parent.clientWidth - el.offsetWidth - 16),
      y: props.defaultPosition.y,
    };
    posRef.current = next;
    setPos(next);
    onPositionChangeRef.current?.(next);
  }, [
    props.open,
    props.defaultAnchor,
    props.defaultPosition.y,
    props.position,
  ]);

  if (!props.open) return null;

  const onPointerDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement;
    if (target.closest('button, input, a, label, [data-no-drag]')) return;
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragRef.current = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      originX: pos.x,
      originY: pos.y,
    };
  };

  const onPointerMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    const parent = panelRef.current?.offsetParent as HTMLElement | null;
    const parentW = parent?.clientWidth ?? window.innerWidth;
    const parentH = parent?.clientHeight ?? window.innerHeight;
    const el = panelRef.current;
    const elW = el?.offsetWidth ?? 240;
    const elH = el?.offsetHeight ?? 120;
    const nextX = drag.originX + (ev.clientX - drag.startX);
    const nextY = drag.originY + (ev.clientY - drag.startY);
    const next = {
      x: Math.min(Math.max(8, nextX), Math.max(8, parentW - elW - 8)),
      y: Math.min(Math.max(8, nextY), Math.max(8, parentH - elH - 8)),
    };
    posRef.current = next;
    setPos(next);
  };

  const onPointerUp = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === ev.pointerId) {
      dragRef.current = null;
      try {
        ev.currentTarget.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      onPositionChangeRef.current?.(posRef.current);
    }
  };

  return (
    <div
      ref={panelRef}
      className={cn('spds-hud', props.className)}
      style={{ left: pos.x, top: pos.y }}
      data-testid={props.testId}
      role="dialog"
      aria-label={props.title}
    >
      <div
        className="spds-hud-titlebar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <GripVertical className="spds-hud-grip" aria-hidden />
        <span className="spds-hud-title">{props.title}</span>
        {props.onOpenChange ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="spds-hud-close"
            aria-label={`Close ${props.title}`}
            data-no-drag
            onClick={() => props.onOpenChange?.(false)}
          >
            <X />
          </Button>
        ) : null}
      </div>
      <div className={cn('spds-hud-body', props.bodyClassName)}>{props.children}</div>
    </div>
  );
}
