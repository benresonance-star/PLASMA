import { describe, expect, it } from 'vitest';
import {
  D01_FIRST_Y_COMPONENT_ID,
  DEMO_Y_SEMANTIC_ID,
  PARAM_D01_LENGTH_ID,
  mapChangeSetTargetId,
} from './id-map.js';

describe('mapChangeSetTargetId', () => {
  it('maps demo and legacy aliases to first D01 Y', () => {
    expect(mapChangeSetTargetId(DEMO_Y_SEMANTIC_ID).pipelineComponentId).toBe(
      D01_FIRST_Y_COMPONENT_ID,
    );
    expect(mapChangeSetTargetId('Y:1').pipelineComponentId).toBe(D01_FIRST_Y_COMPONENT_ID);
    expect(mapChangeSetTargetId(D01_FIRST_Y_COMPONENT_ID).ok).toBe(true);
    expect(mapChangeSetTargetId(PARAM_D01_LENGTH_ID).ok).toBe(true);
  });

  it('rejects unknown ids', () => {
    const r = mapChangeSetTargetId('y:unknown');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Unknown/);
  });
});
