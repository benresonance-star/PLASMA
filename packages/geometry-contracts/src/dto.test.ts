import { describe, expect, it } from 'vitest';
import { GeometryRepresentationSchema } from './dto.js';

describe('geometry-contracts', () => {
  it('requires semanticOwner and validation state', () => {
    const parsed = GeometryRepresentationSchema.parse({
      id: 'repr:1',
      semanticOwner: 'component:y:1',
      pirOperationId: 'pir:1',
      kernel: 'exact-adapter',
      validationState: 'geometry-generated',
      solid: { kind: 'solid', extentsMm: { min: [0, 0, 0], max: [1, 1, 1] } },
      mass: { volumeMm3: 1, areaMm2: 6, centerOfMassMm: [0.5, 0.5, 0.5] },
      subElementPaths: [],
      fabricationReady: true,
    });
    expect(parsed.semanticOwner).toBe('component:y:1');
  });
});
