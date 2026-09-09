import { describe, expect, it } from 'vitest';
import { WHAT_IF_D01_REGEN_BUDGET_MS, gateWhatIfRegen } from './what-if-gate.js';

describe('F1d what-if gate', () => {
  it('accepts in-budget regen; skips OCCT down; forbids demo', () => {
    expect(
      gateWhatIfRegen({
        regenMs: 120,
        source: 'd01-reference-pipeline',
        occtAvailable: true,
      }),
    ).toEqual({ ok: true, regenMs: 120 });

    expect(
      gateWhatIfRegen({
        regenMs: 10,
        source: 'x',
        occtAvailable: false,
      }).reason,
    ).toBe('occt_unavailable');

    expect(
      gateWhatIfRegen({
        regenMs: 10,
        source: 'demo',
        usedDemoMeshes: true,
      }).reason,
    ).toBe('demo_mesh_forbidden');

    expect(
      gateWhatIfRegen({
        regenMs: WHAT_IF_D01_REGEN_BUDGET_MS + 1,
        source: 'd01-reference-pipeline',
      }).reason,
    ).toBe('budget_exceeded');
  });
});
