import { describe, expect, it } from 'vitest';
import { InMemoryUiPreferencesStore } from './ui-preferences-store.js';

describe('UiPreferencesStore (memory)', () => {
  it('puts and gets per-user payload', async () => {
    const store = new InMemoryUiPreferencesStore();
    expect(await store.get('anon:1')).toBeNull();
    const saved = await store.put('anon:1', {
      theme: 'dark',
      viewport: { engines: { reference: { visible: true, opacity: 0.27 } } },
    });
    expect(saved.userId).toBe('anon:1');
    expect(saved.payload.theme).toBe('dark');
    const loaded = await store.get('anon:1');
    expect(loaded?.payload).toEqual(saved.payload);
    expect(loaded?.updatedAt).toBeTruthy();
  });

  it('overwrites on put', async () => {
    const store = new InMemoryUiPreferencesStore();
    await store.put('u', { theme: 'light' });
    const next = await store.put('u', { theme: 'dark' });
    expect(next.payload.theme).toBe('dark');
  });
});
