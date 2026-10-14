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

    // A published manifest includes exact geometry artifacts as well as fabrication.
    // Persist and recover the complete release record, rather than synthesising
    // a partial manifest that cannot meet the exact reproducibility contract.
    const releaseBlob = store.put(JSON.stringify(pipeline.release), 'application/json', ['d01', 'release-manifest']);
    const releaseBackup = store.exportBackup();
    const fullyRestored = new InMemoryObjectStore();
    fullyRestored.restoreBackup(releaseBackup);
    expect(fullyRestored.verify(releaseBlob.contentHash)).toBe(true);
    const releaseBody = fullyRestored.get(releaseBlob.objectKey);
    expect(releaseBody).toBeTruthy();
    const recovered = JSON.parse(releaseBody!) as typeof pipeline.release;
    expect(recovered.manifest.artifactHashes).toEqual(pipeline.release.manifest.artifactHashes);
    const replay = await runD01ReferencePipeline({ yLimit: 4 });
    expect(assessReproducibility(recovered.manifest, replay.release.manifest)).toBe('exact');
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
