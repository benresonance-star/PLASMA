import { describe, expect, it } from 'vitest';
import { boxFeaturePath } from '@spds/geometry-contracts';
import { buildServer } from './server.js';

const OWNER = 'component:y:api-measure';
const EXTENTS = {
  min: [0, -30, -90],
  max: [1000, 30, 90],
};

describe('API measure + compare (angle)', () => {
  it('POST /measure returns exact face-face angle', async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/measure',
      payload: {
        kind: 'angle',
        semanticOwner: OWNER,
        extentsMm: EXTENTS,
        features: [boxFeaturePath(OWNER, 'face', '+x'), boxFeaturePath(OWNER, 'face', '+y')],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exact.unit).toBe('deg');
    expect(body.exact.quantity).toBeCloseTo(90, 5);
    expect(body.exact.engine.label).toMatch(/Exact/i);
  });

  it('POST /measure/compare includes degree tolerance', async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/measure/compare',
      payload: {
        kind: 'angle',
        semanticOwner: OWNER,
        extentsMm: EXTENTS,
        features: [boxFeaturePath(OWNER, 'edge', 0), boxFeaturePath(OWNER, 'edge', 8)],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.toleranceUnit).toBe('deg');
    expect(body.tolerance).toBe(0.25);
    expect(body.exact.quantity).toBeCloseTo(90, 5);
  });
});
