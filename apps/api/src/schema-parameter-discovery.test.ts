import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('package-owned schema parameter discovery', () => {
  it('publishes pattern parameters without a model-specific UI registry', async () => {
    const { app } = buildServer();
    const response = await app.inject({ method: 'GET', url: '/schema' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      mutate: {
        parameters: Array<{
          id: string;
          path: string;
          quantity: { value: number; unit: string };
        }>;
      };
    };
    expect(body.mutate.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'param:goldberg:frequency',
          path: 'params.frequency',
          quantity: { value: 2, unit: '1' },
        }),
        expect.objectContaining({
          id: 'param:d01:length',
          path: 'lengthMm',
          quantity: { value: 2300, unit: 'mm' },
        }),
      ]),
    );
  });
});
