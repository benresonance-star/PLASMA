import { describe, expect, it } from 'vitest';
import {
  applyWhatIfDraft,
  bindWhatIfPreview,
  createIdleWhatIf,
  forkWhatIf,
  rejectWhatIf,
  whatIfBaselineUnchanged,
} from './what-if-session.js';

const mesh = {
  representationId: 'r1',
  semanticOwner: 'component:y:0000',
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ] as const,
  indices: [0, 1, 2],
};

describe('F1 what-if session', () => {
  it('F1a: fork+draft ≤50ms; baseline stable; draft only on fork', () => {
    const idle = createIdleWhatIf('hash:base');
    const t0 = performance.now();
    const forked = forkWhatIf(idle, {
      baselineHash: 'hash:base',
      baselineMeshes: [mesh],
    });
    const drafted = applyWhatIfDraft(forked, {
      parameterId: 'param:d01:lengthMm',
      value: 2400,
    });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(drafted.active).toBe(true);
    expect(drafted.draft?.value).toBe(2400);
    expect(whatIfBaselineUnchanged(forked, drafted)).toBe(true);
    expect(applyWhatIfDraft(idle, { parameterId: 'param:d01:lengthMm', value: 1 }).error).toBe(
      'WHATIF_NOT_FORKED',
    );
  });

  it('F1c: reject restores hash and clears ghosts ≤16ms', () => {
    let state = forkWhatIf(createIdleWhatIf('hash:base'), {
      baselineHash: 'hash:base',
      baselineMeshes: [mesh],
    });
    state = applyWhatIfDraft(state, {
      parameterId: 'param:d01:lengthMm',
      value: 2500,
    });
    state = bindWhatIfPreview(state, {
      previewHash: 'preview:hash:base:x',
      mode: 'regenerated-preview',
      ghostMeshes: [{ ...mesh, representationId: 'ghost:1' }],
      regenMs: 12,
    });
    expect(state.ghostMeshes).toHaveLength(1);
    expect(state.baselineHash).toBe('hash:base');
    const t0 = performance.now();
    const cleared = rejectWhatIf(state);
    expect(performance.now() - t0).toBeLessThan(16);
    expect(cleared.ghostMeshes).toHaveLength(0);
    expect(cleared.baselineHash).toBe('hash:base');
    expect(cleared.active).toBe(false);
    expect(cleared.previewHash).toBeNull();
  });
});
