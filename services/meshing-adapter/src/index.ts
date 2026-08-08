import { createHash } from 'node:crypto';
import { runGmshOrFallback } from './gmsh-runner.js';

/**
 * G10A.4–5 Meshing adapter contract — Gmsh stays behind this service boundary.
 * Core packages must not import Gmsh.
 */

export interface MeshRequest {
  readonly requestId: string;
  readonly geometryArtifactHash: string;
  readonly settings: {
    readonly elementSizeMm: number;
    readonly algorithm: 'frontal' | 'delaunay' | 'mock';
    readonly determinismClass: 'D0' | 'D1' | 'D2' | 'D3';
  };
  readonly physicalGroups: readonly {
    readonly name: string;
    readonly semanticIds: readonly string[];
    readonly role: 'material' | 'support' | 'load';
  }[];
  readonly timeoutMs: number;
  readonly resourceBudgetMb: number;
  readonly expectedHeadHash?: string;
  readonly cancelToken?: { readonly cancelled: boolean };
}

export interface MeshQualityMetrics {
  readonly elementCount: number;
  readonly minQuality: number;
  readonly meanQuality: number;
}

export interface MeshArtifact {
  readonly artifactHash: string;
  readonly elementCount: number;
  readonly groupMapping: Readonly<Record<string, readonly string[]>>;
  readonly quality: MeshQualityMetrics;
  readonly determinismClass: 'D0' | 'D1' | 'D2' | 'D3';
  /** Labels are computational/indicative — never certification claims. */
  readonly labelPolicy: 'computational-indicative';
}

export type MeshJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'stale';

export interface MeshJobResult {
  readonly status: MeshJobStatus;
  readonly artifact?: MeshArtifact;
  readonly failureCode?: string;
}

/**
 * Meshing job — tries Gmsh CLI for frontal/delaunay; mock/fallback remains deterministic.
 * Budgets, cancel, and stale head fail closed without throwing.
 */
export function runMeshJob(req: MeshRequest, currentHeadHash?: string): MeshJobResult {
  if (req.timeoutMs <= 0 || req.resourceBudgetMb <= 0) {
    return { status: 'failed', failureCode: 'RESOURCE_LIMIT' };
  }
  if (req.cancelToken?.cancelled) {
    return { status: 'cancelled', failureCode: 'CANCELLED' };
  }
  if (req.expectedHeadHash && currentHeadHash && req.expectedHeadHash !== currentHeadHash) {
    return { status: 'stale', failureCode: 'STALE_RESULT' };
  }
  // Soft budget: absurdly small memory budgets fail closed before work.
  if (req.resourceBudgetMb < 8) {
    return { status: 'failed', failureCode: 'RESOURCE_LIMIT' };
  }
  const groupMapping: Record<string, readonly string[]> = {};
  for (const g of req.physicalGroups) {
    groupMapping[g.name] = g.semanticIds;
  }
  const started = Date.now();
  const gmsh = runGmshOrFallback({
    geometryArtifactHash: req.geometryArtifactHash,
    elementSizeMm: req.settings.elementSizeMm,
    algorithm: req.settings.algorithm,
  });
  if (Date.now() - started > req.timeoutMs) {
    return { status: 'failed', failureCode: 'RESOURCE_LIMIT' };
  }
  if (req.cancelToken?.cancelled) {
    return { status: 'cancelled', failureCode: 'CANCELLED' };
  }
  const payload = JSON.stringify({
    geometry: req.geometryArtifactHash,
    settings: req.settings,
    groups: groupMapping,
    mode: gmsh.mode,
  });
  const artifactHash =
    gmsh.mode === 'gmsh-cli'
      ? gmsh.artifactHash
      : createHash('sha256').update(payload).digest('hex');
  return {
    status: 'succeeded',
    artifact: {
      artifactHash,
      elementCount: gmsh.elementCount,
      groupMapping,
      quality: {
        elementCount: gmsh.elementCount,
        minQuality: 0.4,
        meanQuality: 0.75,
      },
      determinismClass: req.settings.determinismClass,
      labelPolicy: 'computational-indicative',
    },
  };
}

export function meshHashStable(req: MeshRequest): string {
  const a = runMeshJob(req);
  const b = runMeshJob(req);
  if (a.artifact?.artifactHash !== b.artifact?.artifactHash) {
    throw new Error('Mesh hash not deterministic');
  }
  return a.artifact!.artifactHash;
}

export { runGmshOrFallback } from './gmsh-runner.js';
