import { describe, expect, it } from 'vitest';
import {
  createArtifactObject,
  findOrphanArtifacts,
  verifyArtifactIntegrity,
} from './index.js';

describe('G12A artifact-core', () => {
  it('content-addresses and detects corruption/orphans', () => {
    const a = createArtifactObject({
      bytes: 'mesh-bytes',
      mediaType: 'model/gltf-binary',
      tags: ['mesh'],
    });
    expect(a.contentHash).toHaveLength(64);
    expect(verifyArtifactIntegrity(a, 'mesh-bytes').ok).toBe(true);
    expect(verifyArtifactIntegrity(a, 'tampered').ok).toBe(false);
    const orphans = findOrphanArtifacts([a], new Set());
    expect(orphans).toHaveLength(1);
  });
});
