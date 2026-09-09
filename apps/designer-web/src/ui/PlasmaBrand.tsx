import type { CSSProperties } from 'react';

/** 5×7 LED-style glyphs for the PLASMA header wordmark. */
const GLYPHS: Readonly<Record<string, readonly (readonly number[])[]>> = {
  P: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
  ],
  L: [
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
  ],
  A: [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
  ],
  S: [
    [0, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
  ],
  M: [
    [1, 0, 0, 0, 1],
    [1, 1, 0, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
  ],
};

const WORD = 'PLASMA' as const;
const COLS = 5;
const ROWS = 7;
const LETTER_GAP = 2;
const CELL = 3.2;
/** Slight horizontal oval — reads as a soft pill, not a hard circle. */
const DOT_RX = 1.2;
const DOT_RY = 0.9;

const VIEW_W = WORD.length * COLS + (WORD.length - 1) * LETTER_GAP;
const VIEW_H = ROWS;

export function PlasmaBrand() {
  const dots: { readonly cx: number; readonly cy: number; readonly i: number }[] = [];

  for (let li = 0; li < WORD.length; li++) {
    const glyph = GLYPHS[WORD[li]!];
    if (!glyph) continue;
    const x0 = li * (COLS + LETTER_GAP);
    for (let row = 0; row < ROWS; row++) {
      const line = glyph[row]!;
      for (let col = 0; col < COLS; col++) {
        if (!line[col]) continue;
        dots.push({
          cx: (x0 + col + 0.5) * CELL,
          cy: (row + 0.5) * CELL,
          i: x0 + col,
        });
      }
    }
  }

  return (
    <svg
      className="spds-brand-svg"
      viewBox={`0 0 ${VIEW_W * CELL} ${VIEW_H * CELL}`}
      width={VIEW_W * CELL}
      height={VIEW_H * CELL}
      aria-hidden="true"
      focusable="false"
    >
      {dots.map((d, idx) => (
        <ellipse
          key={idx}
          className="spds-brand-dot"
          cx={d.cx}
          cy={d.cy}
          rx={DOT_RX}
          ry={DOT_RY}
          style={
            {
              '--dot-i': d.i,
              '--dot-rot': idx % 2 === 0 ? 1 : -1,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}
