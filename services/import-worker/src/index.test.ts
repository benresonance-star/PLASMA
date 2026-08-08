import { describe, expect, it } from 'vitest';
import { GeometryClient } from '@spds/geometry-client';
import { InProcessGeometryKernel } from '@spds/geometry-contracts';
import { runStepImportJob } from './index.js';

describe('G10B/E7 import-worker', () => {
  it('imports STEP, counts solids from text, and reports viewport readiness', async () => {
    const bytes = `
ISO-10303-21;
DATA;
#10=MANIFOLD_SOLID_BREP('A',#11);
#20=MANIFOLD_SOLID_BREP('B',#21);
ENDSEC;
`;
    const result = await runStepImportJob({
      jobId: 'job:1',
      filename: 'part.step',
      bytes,
      headerText: 'SI_UNIT(.MILLI.,.METRE.)',
      timeoutMs: 10_000,
    });
    expect(result.status).toBe('succeeded');
    expect(result.viewportReady).toBe(true);
    expect(result.shapes).toHaveLength(2);
    expect(result.probeMode).toBe('in-process');
  });

  it('probes via GeometryClient when provided', async () => {
    const kernel = new InProcessGeometryKernel();
    const client = new GeometryClient({
      baseUrl: 'http://geometry.test',
      fetchImpl: async (url, init) => {
        const path = String(url).replace('http://geometry.test', '');
        if (path === '/v1/sweep' && init?.body) {
          const body = JSON.parse(String(init.body)) as Parameters<typeof kernel.sweep>[0];
          const rep = kernel.sweep(body);
          return new Response(JSON.stringify(rep), { status: 201 });
        }
        return new Response(JSON.stringify({ error: 'not-found' }), { status: 404 });
      },
    });
    const result = await runStepImportJob(
      {
        jobId: 'job:client',
        filename: 'part.step',
        bytes: '#1=MANIFOLD_SOLID_BREP(\'A\',#2);',
        headerText: 'SI_UNIT(.MILLI.,.METRE.)',
        timeoutMs: 5_000,
      },
      { geometryClient: client },
    );
    expect(result.status).toBe('succeeded');
    expect(result.probeMode).toBe('geometry-client');
  });

  it('fails malformed files and ambiguous units; supports cancel', async () => {
    expect(
      (
        await runStepImportJob({
          jobId: 'job:2',
          filename: 'bad.step',
          bytes: 'MALFORMED',
          headerText: 'SI_UNIT(.MILLI.,.METRE.)',
          solidCountHint: 1,
          timeoutMs: 1000,
        })
      ).status,
    ).toBe('failed');
    expect(
      (
        await runStepImportJob({
          jobId: 'job:3',
          filename: 'u.step',
          bytes: 'x',
          headerText: '',
          solidCountHint: 1,
          timeoutMs: 1000,
        })
      ).failureCode,
    ).toBe('IMPORT_UNIT_AMBIGUOUS');
    expect(
      (
        await runStepImportJob({
          jobId: 'job:4',
          filename: 'c.step',
          bytes: '#1=MANIFOLD_SOLID_BREP(\'A\',#2);',
          headerText: 'SI_UNIT(.MILLI.,.METRE.)',
          timeoutMs: 1000,
          cancelToken: { cancelled: true },
        })
      ).status,
    ).toBe('cancelled');
  });
});
