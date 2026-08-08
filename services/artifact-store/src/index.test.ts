import { describe, expect, it } from 'vitest';
import { InMemoryObjectStore } from './index.js';

describe('G12A artifact-store', () => {
  it('stores blobs by hash and survives backup/restore', () => {
    const store = new InMemoryObjectStore();
    const put = store.put('payload', 'application/step', ['fab']);
    expect(store.verify(put.contentHash)).toBe(true);
    const backup = store.exportBackup();
    const restored = new InMemoryObjectStore();
    restored.restoreBackup(backup);
    expect(restored.verify(put.contentHash)).toBe(true);
    expect(restored.get(put.objectKey)).toBe('payload');
  });
});
