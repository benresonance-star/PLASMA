import { describe, expect, it } from 'vitest';
import { assessReproducibility } from '@spds/release-core';
import { runD01ReferencePipeline } from '@spds/reference-pipeline';
import { InMemoryObjectStore } from './index.js';
import { MinioObjectStore } from './minio-store.js';

describe('E1 artifact integrity + release backup/restore', () => {
  it('publishes D01 artifacts, backups, restores, and verifies exact reproducibility', async () => {
    const store = new InMemoryObjectStore();
    const pipeline = await runD01ReferencePipeline({ yLimit: 4 });
    for (const art of pipeline.fabrication.artifacts) {
      const bytes = JSON.stringify(art);
      const put = store.put(bytes, 'application/json', ['d01', 'release']);
      expect(put.contentHash).toBeTruthy();
      expect(store.verify(put.contentHash)).toBe(true);
    }

    const backup = store.exportBackup();
    const restored = new InMemoryObjectStore();
    restored.restoreBackup(backup);
    for (const meta of backup.meta) {
      expect(restored.verify(meta.contentHash)).toBe(true);
    }

    expect(
      assessReproducibility(pipeline.release.manifest, {
        ...pipeline.release.manifest,
        artifactHashes: pipeline.fabrication.artifacts.map((a) => a.contentHash),
      }),
    ).toBe('exact');
  });

  it('puts and verifies against live MinIO when available', async () => {
    const store = new MinioObjectStore({
      endpoint: process.env.MINIO_ENDPOINT ?? 'http://127.0.0.1:9000',
      accessKeyId: process.env.MINIO_ROOT_USER ?? 'spdsminio',
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? 'spdsminio',
      bucket: 'spds-artifacts-test',
    });
    try {
      await store.ensureBucket();
    } catch {
      // Skip if MinIO not reachable in this environment
      return;
    }
    const put = await store.put('d01-release-blob', 'text/plain', ['b17']);
    expect(await store.verify(put.contentHash)).toBe(true);
    const body = await store.get(put.objectKey);
    expect(body).toBe('d01-release-blob');
  });
});
