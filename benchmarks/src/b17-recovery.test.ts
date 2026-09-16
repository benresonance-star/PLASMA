import { describe, expect, it } from 'vitest';
import { InMemoryObjectStore } from '@spds/artifact-store';
import { assessReproducibility } from '@spds/release-core';
import { runD01ReferencePipeline } from '@spds/reference-pipeline';
import { recordBenchmark } from './index.js';

describe('E7 B17 release recovery proof', () => {
  it('restores D01 fixture metadata and independently reproduces the complete manifest', async () => {
    const store = new InMemoryObjectStore();
    const pipeline = await runD01ReferencePipeline({ yLimit: 4 });

    const releasePut = store.put(
      JSON.stringify({
        release: pipeline.release,
        pipelineHash: pipeline.pipelineHash,
        pirHash: pipeline.pirHash,
        dagHash: pipeline.dagHash,
        topologyHash: pipeline.topologyHash,
      }),
      'application/json',
      ['d01', 'release', 'b17'],
    );
    const artifactPuts = pipeline.fabrication.artifacts.map((art) =>
      store.put(JSON.stringify(art), 'application/json', ['d01', 'artifact', 'b17']),
    );
    const manifestPut = store.put(
      JSON.stringify(pipeline.release.manifest),
      'application/json',
      ['d01', 'manifest', 'b17'],
    );

    const allHashes = [releasePut.contentHash, manifestPut.contentHash, ...artifactPuts.map((p) => p.contentHash)];
    expect(allHashes.every((h) => store.verify(h))).toBe(true);

    const backup = store.exportBackup();
    const restored = new InMemoryObjectStore();
    restored.restoreBackup(backup);
    expect(allHashes.every((h) => restored.verify(h))).toBe(true);
    for (const put of artifactPuts) {
      expect(restored.get(put.objectKey)).toBe(store.get(put.objectKey));
    }

    const releaseBlob = restored.get(releasePut.objectKey);
    expect(releaseBlob).toBeTruthy();
    const parsed = JSON.parse(releaseBlob!) as {
      release: { status: string; manifest: typeof pipeline.release.manifest };
      pipelineHash: string;
    };
    expect(parsed.release.status).toBe('published');
    expect(parsed.pipelineHash).toBe(pipeline.pipelineHash);

    // Metadata/fabrication backup is not a backup of compiled kernel artifacts.
    // Compare the restored full manifest to a fresh, independent pipeline run.
    const reproduced = await runD01ReferencePipeline({ yLimit: 4 });
    expect(assessReproducibility(parsed.release.manifest, reproduced.release.manifest)).toBe('exact');

    const t0 = performance.now();
    // Re-verify restored meta set (recovery timing precursor).
    for (const meta of backup.meta) {
      expect(restored.verify(meta.contentHash)).toBe(true);
    }
    recordBenchmark({
      id: 'B17.release-restore',
      durationMs: performance.now() - t0,
      objectCount: backup.meta.length,
      determinismClass: 'D0',
    });
  });
});
