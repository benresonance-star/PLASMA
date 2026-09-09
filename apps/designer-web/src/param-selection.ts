/** Map inspector D01 parameter fields ↔ substrate semantic ids. */

export type D01ParamKey = 'lengthMm' | 'armWidthMm' | 'structuralDepthMm';

export function d01ParamSemanticId(key: D01ParamKey): string {
  return `param:d01:${key}`;
}

export function d01ParamKeyFromSemanticId(semanticId: string | null | undefined): D01ParamKey | null {
  if (!semanticId) return null;
  switch (semanticId) {
    case 'param:d01:lengthMm':
      return 'lengthMm';
    case 'param:d01:armWidthMm':
      return 'armWidthMm';
    case 'param:d01:structuralDepthMm':
      return 'structuralDepthMm';
    default:
      return null;
  }
}
