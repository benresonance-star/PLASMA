import type { PatternInspectorView } from './pattern-types.js';
import type { SemanticDepth } from './types.js';

export type DetailLevel = 'A' | 'B' | 'C' | 'D' | 'E';

export interface PatternCardPayload {
  readonly title: string;
  readonly intent: string;
  readonly parameters: { key: string; value: string }[];
  readonly inputs: string[];
  readonly rules: string[];
  readonly affectors: string[];
  /** Only populated at detail Level E / execution depth. */
  readonly operators: string[];
}

export function detailLevelForDepth(depth: SemanticDepth, zoomLevel?: DetailLevel): DetailLevel {
  if (zoomLevel) return zoomLevel;
  switch (depth) {
    case 'form':
      return 'A';
    case 'intent':
      return 'B';
    case 'system':
      return 'C';
    case 'logic':
      return 'D';
    case 'execution':
      return 'E';
    default: {
      const _exhaustive: never = depth;
      return _exhaustive;
    }
  }
}

export function showOperatorsAt(detail: DetailLevel, depth: SemanticDepth): boolean {
  return detail === 'E' || depth === 'execution';
}

/** Intent-first pattern card (SD3.1). Operators omitted unless Level E / EXECUTION. */
export function buildPatternCard(input: {
  readonly inspector: PatternInspectorView;
  readonly depth: SemanticDepth;
  readonly detailLevel?: DetailLevel;
}): PatternCardPayload {
  const detail = input.detailLevel ?? detailLevelForDepth(input.depth);
  const includeOps = showOperatorsAt(detail, input.depth);
  const parameters = Object.entries(input.inspector.parameters).map(([key, value]) => ({
    key,
    value: String(value),
  }));
  const intentByDepth: Record<SemanticDepth, string> = {
    form: `Form of ${input.inspector.name} — geometry instances only`,
    intent: `Intent: ${input.inspector.name} organises parameters into generated parts`,
    system: `System: ${input.inspector.name} drives generated geometry from parameters`,
    logic: `Logic: mappings and rules inside ${input.inspector.name}`,
    execution: `Execution: operators / kernel bindings for ${input.inspector.name}`,
  };
  return {
    title: input.inspector.name,
    intent: intentByDepth[input.depth],
    parameters:
      detail === 'A'
        ? [...parameters.slice(0, 1)]
        : detail === 'B'
          ? [...parameters.slice(0, 2)]
          : [...parameters],
    inputs: parameters.map((p) => p.key),
    rules:
      detail === 'A' || detail === 'B'
        ? []
        : input.inspector.nodes.filter((n) => n.kind === 'subpattern').map((n) => n.label),
    affectors: [],
    operators: includeOps
      ? Object.entries(input.inspector.operatorBindings).map(([k, v]) => `${k} → ${v}`)
      : [],
  };
}
