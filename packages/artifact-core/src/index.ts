import { createHash } from 'node:crypto';

/** G12A.1 Content-addressed artifact model (SHA-256). */

export interface ArtifactObject {
  readonly artifactId: string;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly createdAt: string;
  readonly tags: readonly string[];
  /** Object-store key — blobs are not stored in Postgres by default. */
  readonly objectKey: string;
}

export function hashContent(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createArtifactObject(input: {
  readonly bytes: string;
  readonly mediaType: string;
  readonly tags?: readonly string[];
  readonly createdAt?: string;
}): ArtifactObject {
  const contentHash = hashContent(input.bytes);
  return {
    artifactId: `artifact:${contentHash.slice(0, 16)}`,
    contentHash,
    byteLength: Buffer.byteLength(input.bytes, 'utf8'),
    mediaType: input.mediaType,
    createdAt: input.createdAt ?? new Date().toISOString(),
    tags: input.tags ?? [],
    objectKey: `sha256/${contentHash.slice(0, 2)}/${contentHash}`,
  };
}

export function verifyArtifactIntegrity(
  artifact: ArtifactObject,
  bytes: string,
): { readonly ok: boolean; readonly reason?: string } {
  const actual = hashContent(bytes);
  if (actual !== artifact.contentHash) {
    return { ok: false, reason: 'ARTIFACT_INTEGRITY_FAILED' };
  }
  if (Buffer.byteLength(bytes, 'utf8') !== artifact.byteLength) {
    return { ok: false, reason: 'ARTIFACT_INTEGRITY_FAILED' };
  }
  return { ok: true };
}

export function findOrphanArtifacts(
  catalog: readonly ArtifactObject[],
  referencedHashes: ReadonlySet<string>,
): readonly ArtifactObject[] {
  return catalog.filter((a) => !referencedHashes.has(a.contentHash));
}
