import { useEffect, useRef } from 'react';
import { clampPanelWidth } from '../panel-layout.js';

export type PanelResizeEdge = 'start' | 'end';

export function PanelResizeHandle(props: {
  readonly edge: PanelResizeEdge;
  readonly widthPx: number;
  readonly minPx: number;
  readonly maxPx: number;
  readonly onWidthChange: (widthPx: number) => void;
  readonly ariaLabel: string;
}) {
  const widthRef = useRef(props.widthPx);
  widthRef.current = props.widthPx;
  const onChangeRef = useRef(props.onWidthChange);
  onChangeRef.current = props.onWidthChange;
  const limitsRef = useRef({ min: props.minPx, max: props.maxPx, edge: props.edge });
  limitsRef.current = { min: props.minPx, max: props.maxPx, edge: props.edge };
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { min, max, edge } = limitsRef.current;
      const delta = e.clientX - drag.startX;
      const next = edge === 'end' ? drag.startW + delta : drag.startW - delta;
      onChangeRef.current(clampPanelWidth(next, min, max));
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.classList.remove('spds-resizing-panels');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('spds-resizing-panels');
    };
  }, []);

  return (
    <button
      type="button"
      className={`spds-panel-resize-handle spds-panel-resize-handle--${props.edge}`}
      aria-label={props.ariaLabel}
      aria-orientation="vertical"
      title={props.ariaLabel}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { startX: e.clientX, startW: widthRef.current };
        document.body.classList.add('spds-resizing-panels');
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
    />
  );
}
