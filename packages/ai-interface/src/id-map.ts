/** Canonical semantic IDs for AI/UI ↔ D01 pipeline. */

export const DEMO_Y_SEMANTIC_ID = 'y:demo:01';
export const D01_FIRST_Y_COMPONENT_ID = 'component:y:0000';
/** Compile-adapter / version-store parameter id for D01 arm length (mm). */
export const PARAM_D01_LENGTH_ID = 'param:d01:length';
export const PARAM_D01_ARM_WIDTH_ID = 'param:d01:armWidth';
export const PARAM_D01_STRUCTURAL_DEPTH_ID = 'param:d01:structuralDepth';
/** D01 published pattern base (T5 apply_pattern allowlist). */
export const GOLDBERG_PATTERN_PUBLISHED_ID = 'pattern:goldberg-cellular-topology@1.0.0';
export const COMPOSITION_D01_ID = 'composition:d01-reference';
export const D01_PATTERN_INSTANCE_ID = 'pattern-instance:d01-reference';

export type D01GeometryParamPath = 'lengthMm' | 'armWidthMm' | 'structuralDepthMm';

const LENGTH_ALIASES = new Set([
  DEMO_Y_SEMANTIC_ID,
  'Y:1',
  D01_FIRST_Y_COMPONENT_ID,
  PARAM_D01_LENGTH_ID,
  'param:d01:lengthMm',
]);

const ARM_ALIASES = new Set([PARAM_D01_ARM_WIDTH_ID, 'param:d01:armWidthMm']);
const DEPTH_ALIASES = new Set([
  PARAM_D01_STRUCTURAL_DEPTH_ID,
  'param:d01:structuralDepthMm',
]);

const ALIASES: ReadonlyMap<string, string> = new Map([
  [DEMO_Y_SEMANTIC_ID, D01_FIRST_Y_COMPONENT_ID],
  ['Y:1', D01_FIRST_Y_COMPONENT_ID],
  [D01_FIRST_Y_COMPONENT_ID, D01_FIRST_Y_COMPONENT_ID],
  [PARAM_D01_LENGTH_ID, D01_FIRST_Y_COMPONENT_ID],
  ['param:d01:lengthMm', D01_FIRST_Y_COMPONENT_ID],
]);

export interface MappedTargetId {
  readonly ok: boolean;
  readonly semanticId: string;
  readonly pipelineComponentId: string;
  readonly reason?: string;
}

export function mapChangeSetTargetId(id: string): MappedTargetId {
  const pipelineComponentId = ALIASES.get(id);
  if (!pipelineComponentId) {
    return {
      ok: false,
      semanticId: id,
      pipelineComponentId: '',
      reason: `Unknown target id ${id}`,
    };
  }
  return {
    ok: true,
    semanticId: DEMO_Y_SEMANTIC_ID,
    pipelineComponentId,
  };
}

export function resolveGeometryParamTarget(
  targetId: string,
):
  | { readonly ok: true; readonly path: D01GeometryParamPath; readonly paramId: string }
  | { readonly ok: false; readonly reason: string } {
  if (LENGTH_ALIASES.has(targetId)) {
    return { ok: true, path: 'lengthMm', paramId: PARAM_D01_LENGTH_ID };
  }
  if (ARM_ALIASES.has(targetId)) {
    return { ok: true, path: 'armWidthMm', paramId: PARAM_D01_ARM_WIDTH_ID };
  }
  if (DEPTH_ALIASES.has(targetId)) {
    return { ok: true, path: 'structuralDepthMm', paramId: PARAM_D01_STRUCTURAL_DEPTH_ID };
  }
  return { ok: false, reason: `Unknown geometry target id ${targetId}` };
}
