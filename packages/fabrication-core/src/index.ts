import { createHash } from 'node:crypto';

export interface PartMeasurement {
  readonly partId: string;
  readonly lengthMm: number;
  readonly angleDeg: number;
  readonly boundingBoxMm: readonly [number, number, number];
  readonly volumeMm3: number;
  readonly massKg: number;
  readonly densityKgPerMm3: number;
}

export interface FabricationArtifact {
  readonly artifactId: string;
  readonly format: 'STEP' | 'STL' | 'GLB';
  readonly snapshotId: string;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly path: string;
  readonly provenance: {
    readonly modelId: string;
    readonly branchId: string;
    readonly producedAt: string;
  };
}

export interface BomLine {
  readonly semanticId: string;
  readonly partFamilyId: string | null;
  readonly quantity: number;
  readonly description: string;
}

export interface CutListLine {
  readonly semanticId: string;
  readonly lengthMm: number;
  readonly angleADeg: number;
  readonly angleBDeg: number;
  readonly quantity: number;
}

export interface DimensionObject {
  readonly id: string;
  readonly kind: 'linear' | 'angular' | 'radial';
  readonly quantity: number;
  readonly unit: 'mm' | 'deg';
  /** Persistent semantic paths — never triangle Face IDs. */
  readonly anchorPathA: string;
  readonly anchorPathB: string;
  readonly resolved: boolean;
}

export interface PartFamilyCluster {
  readonly familyId: string;
  readonly memberIds: readonly string[];
  readonly signature: string;
  readonly maxDeviationMm: number;
  readonly reportOnly: true;
}

export interface FabricationSnapshotOutputs {
  readonly snapshotId: string;
  readonly measurements: readonly PartMeasurement[];
  readonly artifacts: readonly FabricationArtifact[];
  readonly bom: readonly BomLine[];
  readonly cutList: readonly CutListLine[];
  readonly dimensions: readonly DimensionObject[];
  readonly families: readonly PartFamilyCluster[];
}

function hashBytes(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function measurePart(input: {
  readonly partId: string;
  readonly lengthMm: number;
  readonly angleDeg: number;
  readonly boundingBoxMm: readonly [number, number, number];
  readonly volumeMm3: number;
  readonly densityKgPerMm3: number;
}): PartMeasurement {
  if (input.lengthMm <= 0 || input.volumeMm3 <= 0) {
    throw new Error('FABRICATION_INVALID: measurements must be positive');
  }
  return {
    partId: input.partId,
    lengthMm: input.lengthMm,
    angleDeg: input.angleDeg,
    boundingBoxMm: input.boundingBoxMm,
    volumeMm3: input.volumeMm3,
    densityKgPerMm3: input.densityKgPerMm3,
    massKg: input.volumeMm3 * input.densityKgPerMm3,
  };
}

const ALLOWED_PATH_PREFIX = 'artifacts/';

export function exportArtifact(input: {
  readonly format: 'STEP' | 'STL' | 'GLB';
  readonly snapshotId: string;
  readonly modelId: string;
  readonly branchId: string;
  readonly payload: string;
  readonly relativePath: string;
}): FabricationArtifact {
  if (!input.relativePath.startsWith(ALLOWED_PATH_PREFIX)) {
    throw new Error(`Path restriction: exports must be under ${ALLOWED_PATH_PREFIX}`);
  }
  if (input.relativePath.includes('..')) {
    throw new Error('Path restriction: traversal not allowed');
  }
  const contentHash = hashBytes(input.payload);
  return {
    artifactId: `artifact:${contentHash.slice(0, 16)}`,
    format: input.format,
    snapshotId: input.snapshotId,
    contentHash,
    byteLength: Buffer.byteLength(input.payload, 'utf8'),
    path: input.relativePath,
    provenance: {
      modelId: input.modelId,
      branchId: input.branchId,
      producedAt: new Date().toISOString(),
    },
  };
}

export function compileBom(
  parts: readonly { readonly semanticId: string; readonly description: string; readonly familyId?: string }[],
): BomLine[] {
  const counts = new Map<string, { description: string; familyId: string | null; quantity: number }>();
  for (const p of parts) {
    const existing = counts.get(p.semanticId);
    if (existing) {
      existing.quantity += 1;
    } else {
      counts.set(p.semanticId, {
        description: p.description,
        familyId: p.familyId ?? null,
        quantity: 1,
      });
    }
  }
  return [...counts.entries()]
    .map(([semanticId, v]) => ({
      semanticId,
      partFamilyId: v.familyId,
      quantity: v.quantity,
      description: v.description,
    }))
    .sort((a, b) => a.semanticId.localeCompare(b.semanticId));
}

export function compileCutList(
  parts: readonly {
    readonly semanticId: string;
    readonly lengthMm: number;
    readonly angleADeg: number;
    readonly angleBDeg: number;
  }[],
): CutListLine[] {
  const map = new Map<string, CutListLine>();
  for (const p of parts) {
    const key = `${p.semanticId}|${p.lengthMm}|${p.angleADeg}|${p.angleBDeg}`;
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, quantity: existing.quantity + 1 });
    } else {
      map.set(key, {
        semanticId: p.semanticId,
        lengthMm: p.lengthMm,
        angleADeg: p.angleADeg,
        angleBDeg: p.angleBDeg,
        quantity: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.semanticId.localeCompare(b.semanticId));
}

export function createDimension(input: {
  readonly id: string;
  readonly kind: 'linear' | 'angular' | 'radial';
  readonly quantity: number;
  readonly unit: 'mm' | 'deg';
  readonly anchorPathA: string;
  readonly anchorPathB: string;
  readonly knownPaths: ReadonlySet<string>;
}): DimensionObject {
  if (!input.anchorPathA.startsWith('semantic:') || !input.anchorPathB.startsWith('semantic:')) {
    throw new Error('Dimensions must reference semantic: paths, not Face IDs');
  }
  const resolved =
    input.knownPaths.has(input.anchorPathA) && input.knownPaths.has(input.anchorPathB);
  return {
    id: input.id,
    kind: input.kind,
    quantity: input.quantity,
    unit: input.unit,
    anchorPathA: input.anchorPathA,
    anchorPathB: input.anchorPathB,
    resolved,
  };
}

function similaritySignature(m: PartMeasurement): string {
  const len = Math.round(m.lengthMm * 10) / 10;
  const vol = Math.round(m.volumeMm3);
  return `L${len}|V${vol}|A${Math.round(m.angleDeg)}`;
}

/**
 * Exact + tolerance grouping — report-only; applying rationalisation requires ChangeSet/branch.
 */
export function clusterPartFamilies(
  measurements: readonly PartMeasurement[],
  toleranceMm: number,
): PartFamilyCluster[] {
  const clusters: PartFamilyCluster[] = [];
  const used = new Set<string>();
  for (const seed of measurements) {
    if (used.has(seed.partId)) continue;
    const members = [seed];
    used.add(seed.partId);
    for (const other of measurements) {
      if (used.has(other.partId)) continue;
      if (Math.abs(other.lengthMm - seed.lengthMm) <= toleranceMm) {
        members.push(other);
        used.add(other.partId);
      }
    }
    const lengths = members.map((m) => m.lengthMm);
    const maxDeviationMm = Math.max(...lengths) - Math.min(...lengths);
    clusters.push({
      familyId: `family:${similaritySignature(seed)}`,
      memberIds: members.map((m) => m.partId).sort(),
      signature: similaritySignature(seed),
      maxDeviationMm,
      reportOnly: true,
    });
  }
  return clusters.sort((a, b) => a.familyId.localeCompare(b.familyId));
}

/** Applying family rationalisation is never silent — requires explicit branch apply. */
export function applyFamilyRationalisation(input: {
  readonly viaChangeSet: boolean;
  readonly branchApply: boolean;
}): { readonly applied: boolean; readonly reason: string } {
  if (!input.viaChangeSet || !input.branchApply) {
    return {
      applied: false,
      reason: 'Family rationalisation requires ChangeSet + explicit branch apply',
    };
  }
  return { applied: true, reason: 'Applied on branch via ChangeSet' };
}

export function buildD01FabricationOutputs(snapshotId: string): FabricationSnapshotOutputs {
  const measurements = [
    measurePart({
      partId: 'part:Y:1',
      lengthMm: 120,
      angleDeg: 60,
      boundingBoxMm: [100, 40, 40],
      volumeMm3: 80_000,
      densityKgPerMm3: 7.85e-6,
    }),
    measurePart({
      partId: 'part:Y:2',
      lengthMm: 120.05,
      angleDeg: 60,
      boundingBoxMm: [100, 40, 40],
      volumeMm3: 80_100,
      densityKgPerMm3: 7.85e-6,
    }),
    measurePart({
      partId: 'part:Y:3',
      lengthMm: 200,
      angleDeg: 90,
      boundingBoxMm: [180, 40, 40],
      volumeMm3: 120_000,
      densityKgPerMm3: 7.85e-6,
    }),
  ];
  const artifacts = (['STEP', 'STL', 'GLB'] as const).map((format) =>
    exportArtifact({
      format,
      snapshotId,
      modelId: 'model:D01',
      branchId: 'branch:main',
      payload: `D01-${format}-${snapshotId}`,
      relativePath: `artifacts/D01/${snapshotId}.${format.toLowerCase()}`,
    }),
  );
  const bom = compileBom([
    { semanticId: 'part:Y:1', description: 'Y-node strut A', familyId: 'family:L120' },
    { semanticId: 'part:Y:2', description: 'Y-node strut A', familyId: 'family:L120' },
    { semanticId: 'part:Y:3', description: 'Y-node strut B' },
  ]);
  const cutList = compileCutList([
    { semanticId: 'part:Y:1', lengthMm: 120, angleADeg: 30, angleBDeg: 30 },
    { semanticId: 'part:Y:2', lengthMm: 120, angleADeg: 30, angleBDeg: 30 },
    { semanticId: 'part:Y:3', lengthMm: 200, angleADeg: 45, angleBDeg: 45 },
  ]);
  const known = new Set(['semantic:vertex/A', 'semantic:vertex/B', 'semantic:edge/E1']);
  const dimensions = [
    createDimension({
      id: 'dim:1',
      kind: 'linear',
      quantity: 120,
      unit: 'mm',
      anchorPathA: 'semantic:vertex/A',
      anchorPathB: 'semantic:vertex/B',
      knownPaths: known,
    }),
  ];
  const families = clusterPartFamilies(measurements, 0.1);
  return { snapshotId, measurements, artifacts, bom, cutList, dimensions, families };
}
