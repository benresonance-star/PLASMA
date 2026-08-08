import type { DeterminismClass } from '@spds/reproducibility';
import { assertDeterminismClass } from '@spds/reproducibility';

/** G12A DesignRelease + reproducibility manifest. */

export type ReproducibilityStatus = 'exact' | 'compatible' | 'not-reproducible';

export interface ReproducibilityManifest {
  readonly compilerVersion: string;
  readonly operatorVersions: Readonly<Record<string, string>>;
  readonly tolerancePolicyVersion: string;
  readonly determinismClass: DeterminismClass;
  readonly artifactHashes: readonly string[];
}

export type DesignReleaseStatus = 'draft' | 'validated' | 'published' | 'superseded';

export interface DesignRelease {
  readonly releaseId: string;
  readonly snapshotId: string;
  readonly status: DesignReleaseStatus;
  readonly manifest: ReproducibilityManifest;
  readonly fabricationProtected: boolean;
  readonly createdAt: string;
}

export function buildManifest(input: ReproducibilityManifest): ReproducibilityManifest {
  assertDeterminismClass(input.determinismClass);
  return input;
}

export function assessReproducibility(
  published: ReproducibilityManifest,
  current: ReproducibilityManifest,
): ReproducibilityStatus {
  if (
    published.compilerVersion === current.compilerVersion &&
    published.tolerancePolicyVersion === current.tolerancePolicyVersion &&
    JSON.stringify(published.operatorVersions) === JSON.stringify(current.operatorVersions) &&
    published.artifactHashes.join() === current.artifactHashes.join()
  ) {
    return 'exact';
  }
  const opsCompatible = Object.entries(published.operatorVersions).every(
    ([k, v]) => current.operatorVersions[k] === v || current.operatorVersions[k]?.startsWith(v.split('.')[0]!),
  );
  if (opsCompatible && published.tolerancePolicyVersion === current.tolerancePolicyVersion) {
    return 'compatible';
  }
  return 'not-reproducible';
}

export function createDesignRelease(input: {
  readonly snapshotId: string;
  readonly manifest: ReproducibilityManifest;
  readonly fabricationProtected?: boolean;
}): DesignRelease {
  return {
    releaseId: `release:${input.snapshotId}`,
    snapshotId: input.snapshotId,
    status: 'draft',
    manifest: buildManifest(input.manifest),
    fabricationProtected: input.fabricationProtected ?? true,
    createdAt: new Date().toISOString(),
  };
}

export function validateRelease(release: DesignRelease): DesignRelease {
  if (release.manifest.artifactHashes.length === 0) {
    throw new Error('PUBLICATION_BLOCKED: release requires artifacts');
  }
  return { ...release, status: 'validated' };
}

export function publishRelease(release: DesignRelease): DesignRelease {
  if (release.status !== 'validated') {
    throw new Error('PUBLICATION_BLOCKED: validate before publish');
  }
  return { ...release, status: 'published' };
}

/** GC dry-run: fabrication-release artifacts are protected from auto-GC. */
export function gcDryRun(input: {
  readonly artifacts: readonly { readonly hash: string; readonly releaseProtected: boolean }[];
  readonly orphanHashes: readonly string[];
}): { readonly wouldDelete: readonly string[]; readonly protected: readonly string[] } {
  const protectedHashes = input.artifacts.filter((a) => a.releaseProtected).map((a) => a.hash);
  const wouldDelete = input.orphanHashes.filter((h) => !protectedHashes.includes(h));
  return { wouldDelete, protected: protectedHashes };
}
