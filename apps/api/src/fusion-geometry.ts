import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import { composeFirstFusion, hashSourceBytes, type FusionBinding } from '@spds/import-core';
import {
  InProcessGeometryKernel, executeExactCompile, parseGeometryCompileRequest,
  type GeometryCompileRequest,
} from '@spds/geometry-contracts';

function record(input: unknown, name: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(name + ': expected object');
  return input as Record<string, unknown>;
}
function rows(input: unknown, name: string): unknown[] {
  if (!Array.isArray(input)) throw new Error(name + ': expected array');
  return input;
}
function num(expr: unknown, params: Record<string, unknown>, name: string): number {
  const value = typeof expr === 'string' ? params[expr] : expr;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(name + ': unsupported numeric expression or missing parameter');
  }
  return value;
}
function translate(input: unknown): [number, number, number] {
  if (!Array.isArray(input) || input.length !== 3 ||
      !input.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error('Invalid placement translation');
  }
  return input as [number, number, number];
}

/**
 * FUSION-03a: one explicit, *source-bound* Loft rectangle sketch + extrude.
 * A deterministic exact-adapter mesh is produced. This does NOT invoke native
 * OCCT B-rep workers, validate external construction rules or commit anything.
 */
export function previewSupportedLoftSolid(input: {
  readonly buildProject: unknown;
  readonly loftProject: unknown;
  readonly bindings: readonly FusionBinding[];
  readonly expectedSourceHashes: { readonly build: string; readonly loft: string };
  readonly loftOccurrenceId: string;
}) {
  const preview = composeFirstFusion(input);
  const buildHash = preview.sources.find((s) => s.system === 'build')?.sourceHash;
  const loftHash = preview.sources.find((s) => s.system === 'loft')?.sourceHash;
  if (!buildHash || !loftHash ||
      input.expectedSourceHashes.build !== buildHash ||
      input.expectedSourceHashes.loft !== loftHash) throw new Error('FUSION_SOURCE_STALE');
  if (!preview.bindings.some((b) => b.loftOccurrenceId === input.loftOccurrenceId)) {
    throw new Error('FUSION_UNBOUND_OCCURRENCE');
  }
  const occurrence = preview.objects.find((o) =>
    o.id === input.loftOccurrenceId && o.semanticType === 'geometry.loft.occurrence');
  if (!occurrence) throw new Error('FUSION_OCCURRENCE_MISSING');
  const partName = occurrence.metadata?.['sourcePartId'];
  const assemblyName = occurrence.metadata?.['sourceAssemblyId'];
  const instanceName = occurrence.metadata?.['sourceInstanceId'];
  const loft = record(input.loftProject, 'Loft');
  const part = rows(loft['parts'], 'Loft.parts')
    .map((x) => record(x, 'Loft.part')).find((x) => x['id'] === partName);
  const assembly = rows(loft['assemblies'], 'Loft.assemblies')
    .map((x) => record(x, 'Loft.assembly')).find((x) => x['id'] === assemblyName);
  const instance = rows(assembly?.['instances'], 'Loft.instances')
    .map((x) => record(x, 'Loft.instance')).find((x) => x['id'] === instanceName);
  if (!part || !instance) throw new Error('FUSION_SOURCE_OCCURRENCE_MISSING');
  const features = rows(part['features'], 'Loft.features');
  if (features.length !== 2) throw new Error('FUSION_FEATURE_UNSUPPORTED: requires one sketch and one extrusion');
  const sketch = record(features[0], 'Loft.sketch');
  const extrude = record(features[1], 'Loft.extrude');
  const plane = record(sketch['plane'], 'Loft.sketch.plane');
  const profile = record(sketch['profile'], 'Loft.sketch.profile');
  if (sketch['type'] !== 'sketch' || extrude['type'] !== 'extrude' ||
      extrude['sketch'] !== sketch['id'] ||
      plane['type'] !== 'datum' || plane['name'] !== 'XY' ||
      plane['offset'] !== undefined || profile['kind'] !== 'rectangle') {
    throw new Error('FUSION_FEATURE_UNSUPPORTED: only XY rectangle sketch/extrude, no offset or modifiers');
  }
  const params = record(part['parameters'] ?? {}, 'Loft.parameters');
  const w = num(profile['width'], params, 'width');
  const h = num(profile['height'], params, 'height');
  const d = num(extrude['depth'], params, 'depth');
  const dx = num(profile['x'] ?? 0, params, 'x');
  const dy = num(profile['y'] ?? 0, params, 'y');
  if ([w,h,d].some((v) => v <= 0.01 || v > 100000)) {
    throw new Error('FUSION_DIMENSION_UNSUPPORTED');
  }
  const placement = record(instance['placement'] ?? {}, 'Loft.placement');
  const [tx,ty,tz] = translate(placement['translation'] ?? [0,0,0]);
  if (Object.keys(placement).some((key) => key !== 'translation')) {
    throw new Error('FUSION_PLACEMENT_UNSUPPORTED: only translation may be bridged');
  }
  const cx = tx + dx;
  const cy = ty + dy;
  const profilePoints: [number, number, number][] = [
    [cx-w/2, cy-h/2, tz],
    [cx+w/2, cy-h/2, tz],
    [cx+w/2, cy+h/2, tz],
    [cx-w/2, cy+h/2, tz],
  ];
  const op = {
    op: 'geometry.extrude@1.0.0' as const,
    semanticOwner: input.loftOccurrenceId,
    pirOperationId: input.loftOccurrenceId + ':extrusion',
    featurePath: String(extrude['id']),
    profile: profilePoints,
    vector: [0,0,d] as [number,number,number],
  };
  const request: GeometryCompileRequest = parseGeometryCompileRequest({
    snapshotHash: hashSourceBytes(buildHash + loftHash),
    pirHash: hashSourceBytes(JSON.stringify(op)),
    dagHash: hashSourceBytes(String(sketch['id']) + ':' + String(extrude['id'])),
    compilerVersion: 'fusion-03a/0.1',
    parameters: {},
    ops: [op], chordDeviationMm: 1, angleDeviationDeg: 20,
  });
  const compiled = executeExactCompile(new InProcessGeometryKernel(), request);
  if (!compiled.meshes.length || compiled.meshes.some((m) => m.triangleCount < 4)) {
    throw new Error('FUSION_GEOMETRY_EMPTY');
  }
  return {
    status: 'preview-only' as const,
    kernel: 'exact-adapter' as const,
    nativeBrep: false as const,
    publicationReady: false as const,
    semanticOwner: input.loftOccurrenceId,
    compileHash: compiled.compileHash,
    sourceHashes: { build: buildHash, loft: loftHash },
    meshes: compiled.meshes,
    unresolved: [
      'No native OpenCascade B-rep equivalence proof',
      'No construction-system evaluation, IFC or detail regeneration',
      'Preview mesh remains derived and uncommitted',
    ],
  };
}
export function registerFusionGeometryRoute(app: FastifyInstance, store: VersionStore): void {
  app.post<{
    Body: Parameters<typeof previewSupportedLoftSolid>[0] & {
      readonly modelId: string;
      readonly branchId: string;
      readonly expectedHeadHash: string;
    };
  }>('/imports/fusion/geometry-preview', async (req, reply) => {
    const body = req.body;
    if (!body || typeof body.modelId !== 'string' || !body.modelId ||
        typeof body.branchId !== 'string' || !body.branchId ||
        typeof body.expectedHeadHash !== 'string' || !body.expectedHeadHash) {
      return reply.code(422).send({ failureCode: 'FUSION_BASE_REQUIRED' });
    }
    try {
      const branch = await asPromise(store.getBranchHead(body.branchId));
      if (branch.modelId !== body.modelId || branch.headHash !== body.expectedHeadHash) {
        return reply.code(409).send({ failureCode: 'FUSION_HEAD_CONFLICT' });
      }
      const result = previewSupportedLoftSolid(body);
      const after = await asPromise(store.getBranchHead(body.branchId));
      if (after.headHash !== body.expectedHeadHash) {
        return reply.code(409).send({ failureCode: 'FUSION_HEAD_CONFLICT' });
      }
      return reply.send({ ...result, basedOnHeadHash: body.expectedHeadHash });
    } catch (err) {
      return reply.code(422).send({
        failureCode: 'FUSION_GEOMETRY_UNSUPPORTED',
        summary: err instanceof Error ? err.message : 'Unable to compile supported solid',
        publicationReady: false,
      });
    }
  });
}
