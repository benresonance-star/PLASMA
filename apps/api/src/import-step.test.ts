import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('E9 API STEP import', () => {
  it('imports STEP text, stores asset wrap, reports viewportReady', async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/imports/step',
      payload: {
        filename: 'bracket.step',
        bytes: `
ISO-10303-21;
DATA;
#10=MANIFOLD_SOLID_BREP('A',#11);
ENDSEC;
`,
        headerText: 'SI_UNIT(.MILLI.,.METRE.)',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      status: string;
      shapeCount: number;
      viewportReady: boolean;
      asset: { parametricClaim: string; units: string };
      stored: { verified: boolean };
    };
    expect(body.status).toBe('succeeded');
    expect(body.shapeCount).toBe(1);
    expect(body.viewportReady).toBe(true);
    expect(body.asset.parametricClaim).toBe('reference-only');
    expect(body.asset.units).toBe('mm');
    expect(body.stored.verified).toBe(true);
  });

  it('rejects ambiguous units with structured failure', async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/imports/step',
      payload: {
        filename: 'x.step',
        bytes: '#1=MANIFOLD_SOLID_BREP(\'A\',#2);',
        headerText: '',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ failureCode: 'IMPORT_UNIT_AMBIGUOUS' });
  });
});
