import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';
import { InMemoryUiPreferencesStore } from './db/ui-preferences-store.js';

describe('UI preferences API', () => {
  it('gets empty payload then upserts and reloads', async () => {
    const uiPreferences = new InMemoryUiPreferencesStore();
    const { app } = buildServer(undefined, { uiPreferences });

    const missingUser = await app.inject({ method: 'GET', url: '/ui-preferences' });
    expect(missingUser.statusCode).toBe(400);

    const empty = await app.inject({
      method: 'GET',
      url: '/ui-preferences?userId=anon%3Atest',
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({
      userId: 'anon:test',
      payload: {},
      updatedAt: null,
    });

    const put = await app.inject({
      method: 'PUT',
      url: '/ui-preferences',
      payload: {
        userId: 'anon:test',
        payload: {
          theme: 'dark',
          viewport: {
            engines: {
              reference: { visible: true, opacity: 0.27 },
              geometryService: { visible: true, opacity: 0.15 },
            },
            camera: { position: [1, 2, 3], target: [0, 0, 0] },
          },
        },
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().payload.theme).toBe('dark');

    const loaded = await app.inject({
      method: 'GET',
      url: '/ui-preferences?userId=anon%3Atest',
    });
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().payload.viewport.engines.geometryService.opacity).toBe(0.15);
  });
});
