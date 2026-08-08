import {
  createArtifactObject,
  verifyArtifactIntegrity,
  type ArtifactObject,
} from '@spds/artifact-core';
import type { ObjectStorePutResult } from './minio-store.js';

export type { ObjectStorePutResult } from './minio-store.js';
export {
  MinioObjectStore,
  minioConfigFromEnv,
  type MinioStoreConfig,
} from './minio-store.js';

/**
 * G12A.2 In-memory object-store (tests + offline).
 * Large blobs stay out of the DB by default.
 */
export class InMemoryObjectStore {
  private readonly blobs = new Map<string, string>();
  private readonly meta = new Map<string, ArtifactObject>();

  put(bytes: string, mediaType: string, tags: readonly string[] = []): ObjectStorePutResult {
    const artifact = createArtifactObject({ bytes, mediaType, tags });
    this.blobs.set(artifact.objectKey, bytes);
    this.meta.set(artifact.contentHash, artifact);
    return { objectKey: artifact.objectKey, contentHash: artifact.contentHash };
  }

  get(objectKey: string): string | undefined {
    return this.blobs.get(objectKey);
  }

  verify(contentHash: string): boolean {
    const artifact = this.meta.get(contentHash);
    if (!artifact) return false;
    const bytes = this.blobs.get(artifact.objectKey);
    if (bytes === undefined) return false;
    return verifyArtifactIntegrity(artifact, bytes).ok;
  }

  /** Backup/restore proof: export then reimport and verify hashes. */
  exportBackup(): { readonly blobs: Record<string, string>; readonly meta: ArtifactObject[] } {
    return {
      blobs: Object.fromEntries(this.blobs),
      meta: [...this.meta.values()],
    };
  }

  restoreBackup(backup: {
    readonly blobs: Record<string, string>;
    readonly meta: ArtifactObject[];
  }): void {
    this.blobs.clear();
    this.meta.clear();
    for (const [k, v] of Object.entries(backup.blobs)) this.blobs.set(k, v);
    for (const m of backup.meta) this.meta.set(m.contentHash, m);
  }

  listMeta(): ArtifactObject[] {
    return [...this.meta.values()];
  }
}
