import { describe, expect, it } from 'vitest';
import { buildGeometryServer } from './server.js';

describe('E8 geometry STEP text probe', () => {
  it('counts MANIFOLD_SOLID_BREP without claiming B-rep parse', async () => {
    const { app } = buildGeometryServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/import/step/probe',
      payload: {
        stepText: "#10=MANIFOLD_SOLID_BREP('A',#11);#20=MANIFOLD_SOLID_BREP('B',#21);",
        headerText: 'SI_UNIT(.MILLI.,.METRE.)',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      solidCountHint: number;
      unitsHint: string;
      parametricClaim: string;
      note: string;
    };
    expect(body.solidCountHint).toBe(2);
    expect(body.unitsHint).toBe('mm');
    expect(body.parametricClaim).toBe('reference-only');
    expect(body.note).toMatch(/Text probe only/i);
  });
});
