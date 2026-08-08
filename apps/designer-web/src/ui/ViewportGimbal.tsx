import type { CSSProperties } from 'react';
import type { GimbalFace } from './viewport-controls.js';

export interface ViewportGimbalProps {
  readonly onFace: (face: GimbalFace) => void;
  readonly onHome: () => void;
}

const FACES: readonly {
  readonly face: GimbalFace;
  readonly label: string;
  readonly style: CSSProperties;
}[] = [
  { face: '+y', label: 'Top', style: { gridArea: '1 / 2' } },
  { face: '-x', label: 'Left', style: { gridArea: '2 / 1' } },
  { face: '+z', label: 'Front', style: { gridArea: '2 / 2' } },
  { face: '+x', label: 'Right', style: { gridArea: '2 / 3' } },
  { face: '-y', label: 'Bottom', style: { gridArea: '3 / 2' } },
  { face: 'iso', label: 'Iso', style: { gridArea: '1 / 3' } },
];

/** Top-right viewcube / navigation gimbal (CAD norms). */
export function ViewportGimbal(props: ViewportGimbalProps) {
  return (
    <div className="spds-viewport-gimbal" aria-label="View navigation" role="toolbar">
      <div className="spds-viewport-gimbal-grid">
        {FACES.map((f) => (
          <button
            key={f.face}
            type="button"
            className="spds-viewport-gimbal-face"
            style={f.style}
            aria-label={`View ${f.label}`}
            title={f.label}
            onClick={() => props.onFace(f.face)}
          >
            {f.label[0]}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="spds-viewport-home"
        aria-label="Home view"
        title="Home (fit all)"
        onClick={props.onHome}
      >
        Home
      </button>
    </div>
  );
}
