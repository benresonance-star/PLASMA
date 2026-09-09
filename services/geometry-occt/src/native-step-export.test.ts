import { describe, expect, it, beforeAll } from 'vitest';
import { OcctNativeKernel } from './occt-native-kernel.js';

describe('N1.7 native STEP export', () => {
  const kernel = new OcctNativeKernel();

  beforeAll(async () => {
    await kernel.ensureReady();
  }, 60_000);

  it('exports ISO-10303 STEP with solid entities and stable content hash', () => {
    const rep = kernel.sweep({
      semanticOwner: 'component:y:step',
      pirOperationId: 'pir:step',
      path: [
        [0, 0, 0],
        [500, 0, 0],
      ],
      profileWidthMm: 60,
      profileDepthMm: 180,
    });
    const a = kernel.exportStep(rep.id);
    const b = kernel.exportStep(rep.id);
    expect(a.stepText.startsWith('ISO-10303-21')).toBe(true);
    expect(a.stepText).toMatch(/MANIFOLD_SOLID_BREP|CLOSED_SHELL/i);
    expect(a.contentHash).toHaveLength(64);
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.fabricationReady).toBe(false);
    expect(a.parametricClaim).toBe('reference-only');
  });
});
