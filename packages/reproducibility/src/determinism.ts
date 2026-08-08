/** Determinism classes D0-D3 (spec section 5B.16). */

export const DETERMINISM_CLASSES = ['D0', 'D1', 'D2', 'D3'] as const;
export type DeterminismClass = (typeof DETERMINISM_CLASSES)[number];

export const DETERMINISM_CLASS_DESCRIPTIONS: Record<DeterminismClass, string> = {
  D0: 'Semantic deterministic — same canonical semantic input => same semantic hash',
  D1: 'Operation deterministic — same resolved state + operator versions => same PIR/DAG',
  D2: 'Geometric-equivalent — exact geometry equivalent within declared tolerance',
  D3: 'Byte-reproducible artifact — canonical deterministic serialization where supported',
};

export function assertDeterminismClass(value: string): asserts value is DeterminismClass {
  if (!(DETERMINISM_CLASSES as readonly string[]).includes(value)) {
    throw new Error(`Unknown determinism class: ${value}`);
  }
}
