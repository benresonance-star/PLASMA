import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('E9/E10 API STEP import + semantic commands', () => {
  it('accepts VALIDATE and rejects headless DELETE', async () => {
    const { app } = buildServer();
    const ok = await app.inject({
      method: 'POST',
      url: '/commands/accept',
      payload: {
        commandId: 'cmd:v',
        command: 'VALIDATE',
        modelId: 'model:1',
        branchId: 'branch:main',
        actorId: 'user:1',
      },
    });
    expect(ok.statusCode).toBe(202);
    const bad = await app.inject({
      method: 'POST',
      url: '/commands/accept',
      payload: {
        commandId: 'cmd:d',
        command: 'DELETE',
        modelId: 'model:1',
        branchId: 'branch:main',
        actorId: 'user:1',
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toMatchObject({ failureCode: 'HEAD_CONFLICT' });
  });

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
