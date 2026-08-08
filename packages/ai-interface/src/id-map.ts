/** Canonical semantic IDs for AI/UI ↔ D01 pipeline (MVP: first Y only). */

export const DEMO_Y_SEMANTIC_ID = 'y:demo:01';
export const D01_FIRST_Y_COMPONENT_ID = 'component:y:0000';

const ALIASES: ReadonlyMap<string, string> = new Map([
  [DEMO_Y_SEMANTIC_ID, D01_FIRST_Y_COMPONENT_ID],
  ['Y:1', D01_FIRST_Y_COMPONENT_ID],
  [D01_FIRST_Y_COMPONENT_ID, D01_FIRST_Y_COMPONENT_ID],
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
