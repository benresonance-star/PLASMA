import { describe, expect, it } from 'vitest';
import { ExactKernelAdapter } from './exact-kernel.js';
import {
  applyPlaneCut,
  applyScalarRadial,
  applyVolumeExclusion,
  assertWorldFrame,
  defaultWorldFrame,
} from './affectors.js';
import { healSoft, validateGeometryRepresentation } from './validation.js';
import { parseCoordinateFrame } from '@spds/coordinate-frames';

describe('G7 affectors and validation', () => {
  it('applies WORLD plane cut independent of local component transform', () => {
    const kernel = new ExactKernelAdapter();
    const world = defaultWorldFrame();
    const low = kernel.sweep({
      semanticOwner: 'component:y:low',
      pirOperationId: 'pir:low',
      path: [
        [0, 0, 0],
        [100, 0, 0],
      ],
      profileWidthMm: 40,
      profileDepthMm: 40,
    });
    const high = kernel.sweep({
      semanticOwner: 'component:y:high',
      pirOperationId: 'pir:high',
      path: [
        [0, 0, 2000],
        [100, 0, 2000],
      ],
      profileWidthMm: 40,
      profileDepthMm: 40,
    });
    const cut = applyPlaneCut(
      kernel,
      {
        id: 'aff:cut',
        kind: 'world-plane-cut',
        frameId: world.id,
        planeZMm: 1000,
        targetRepresentationIds: [low.id, high.id],
      },
      world,
    );
    expect(cut.find((r) => r.semanticOwner === 'component:y:low')?.fabricationReady).toBe(false);
    expect(cut.find((r) => r.semanticOwner === 'component:y:high')?.fabricationReady).toBe(true);
    expect(() =>
      assertWorldFrame(
        parseCoordinateFrame({
          id: 'frame:component',
          role: 'COMPONENT',
          parentId: world.id,
          provenance: { source: 't' },
        }),
      ),
    ).toThrow(/WORLD/);
  });

  it('supports volume exclusion, scalar affector, heal and validate', () => {
    const kernel = new ExactKernelAdapter();
    const rep = kernel.sweep({
      semanticOwner: 'component:y:x',
      pirOperationId: 'pir:x',
      path: [
        [10, 10, 10],
        [110, 10, 10],
      ],
      profileWidthMm: 50,
      profileDepthMm: 50,
    });
    const excluded = applyVolumeExclusion(kernel, {
      id: 'aff:box',
      kind: 'box-exclusion',
      minMm: [0, 0, 0],
      maxMm: [200, 200, 200],
      targetRepresentationIds: [rep.id],
    });
    expect(excluded[0]?.mass.volumeMm3).toBe(0);

    const scaled = applyScalarRadial(kernel, {
      id: 'aff:scale',
      kind: 'scalar-radial',
      scale: 2,
      targetRepresentationIds: [rep.id],
    });
    expect(scaled[0]!.mass.volumeMm3).toBeCloseTo(rep.mass.volumeMm3 * 8);

    const report = validateGeometryRepresentation(rep);
    expect(report.ok).toBe(true);
    const healed = healSoft({ ...rep, validationState: 'geometry-invalid' });
    expect(healed.validationState).toBe('geometry-generated');
  });
});
