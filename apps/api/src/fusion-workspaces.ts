import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import {
  composeFirstFusion, hashSourceBytes, deriveFusionSourceRevision,
  createFusionSectionSheet, type FusionBinding, type FusionParameterLink,
  type FusionRevisionInput,
} from '@spds/import-core';
import { previewSupportedLoftSolid } from './fusion-geometry.js';

/** A source workspace is ONE revisioned Plasma version-store object.
 * It is not the accepted whole-building BIM semantic graph.
 */
interface FusionSourceBundle {
  readonly buildProject: unknown;
  readonly loftProject: unknown;
  readonly bindings: readonly FusionBinding[];
}
interface WorkspaceMeta {
  readonly contract: 'plasma.fusion.source-workspace/0.1';
  readonly sources: FusionSourceBundle;
  readonly sourceHashes: { readonly build: string; readonly loft: string };
  readonly revision: number;
  readonly lastChange?: {
    readonly buildParameterId: string;
    readonly valueBefore: number;
    readonly valueAfter: number;
    readonly parameterUnit: string;
    readonly candidateHash: string;
    readonly afterGeometryHash: string;
    readonly afterSectionHash: string;
    readonly acceptedAt: string;
  };
}
interface WorkspaceObject {
  readonly id: string;
  readonly kind: 'Model';
  readonly semanticType: 'plasma.fusion.source-workspace';
  readonly name: string;
  readonly schemaVersion: '1.0.0';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: WorkspaceMeta;
}
interface HeadInput {
  readonly modelId: string;
  readonly branchId: string;
  readonly expectedHeadHash: string;
}
interface ChangeInput extends HeadInput {
  readonly expectedSourceHashes: { readonly build: string; readonly loft: string };
  readonly buildParameterId: string;
  readonly nextValue: number;
  readonly loftLink: FusionParameterLink;
  readonly sectionYmm: number;
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(label + ': expected object');
  }
  return value as Record<string, unknown>;
}
function boundedSize(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 950_000)
    throw new Error('FUSION_WORKSPACE_SIZE_LIMIT');
}
function workspaceIdFor(preview: ReturnType<typeof composeFirstFusion>): string {
  const buildId = preview.sources.find((s) => s.system === 'build')!.projectId;
  const loftId = preview.sources.find((s) => s.system === 'loft')!.projectId;
  return 'entity:fusion:workspace:' + hashSourceBytes(buildId + '\u0000' + loftId).slice(0,24);
}
function sourceHashes(preview: ReturnType<typeof composeFirstFusion>): WorkspaceMeta['sourceHashes'] {
  const build = preview.sources.find((s) => s.system === 'build')?.sourceHash;
  const loft = preview.sources.find((s) => s.system === 'loft')?.sourceHash;
  if (!build || !loft) throw new Error('FUSION_SOURCE_HASH_MISSING');
  return { build, loft };
}
async function checkHead(store: VersionStore, body: HeadInput): Promise<void> {
  if (!body?.modelId || !body?.branchId || !body?.expectedHeadHash)
    throw new Error('FUSION_HEAD_REQUIRED');
  const head = await asPromise(store.getBranchHead(body.branchId));
  if (head.modelId !== body.modelId || head.headHash !== body.expectedHeadHash)
    throw new Error('FUSION_HEAD_CONFLICT');
}
async function loadWorkspace(store: VersionStore, id: string, branchId: string): Promise<WorkspaceObject> {
  const raw = await asPromise(store.getObject(branchId, id));
  if (!raw) throw new Error('FUSION_WORKSPACE_NOT_FOUND');
  if (raw['semanticType'] !== 'plasma.fusion.source-workspace')
    throw new Error('FUSION_WORKSPACE_TYPE_MISMATCH');
  const metadata = object(raw['metadata'], 'Workspace metadata') as unknown as WorkspaceMeta;
  if (metadata.contract !== 'plasma.fusion.source-workspace/0.1')
    throw new Error('FUSION_WORKSPACE_CONTRACT_UNSUPPORTED');
  const p = composeFirstFusion(metadata.sources);
  const hashes = sourceHashes(p);
  if (hashes.build !== metadata.sourceHashes.build || hashes.loft !== metadata.sourceHashes.loft)
    throw new Error('FUSION_STORED_SOURCE_INTEGRITY_FAILURE');
  return raw as unknown as WorkspaceObject;
}
function classifyError(err: unknown): { code: number; failureCode: string; summary: string } {
  const summary = err instanceof Error ? err.message : 'Invalid fusion workspace operation';
  if (summary.includes('HEAD_CONFLICT') || summary.includes('SOURCE_STALE') ||
      summary.includes('CANDIDATE_STALE') || summary.includes('ALREADY_EXISTS')) {
    return { code: 409, failureCode: 'FUSION_REVISION_CONFLICT', summary };
  }
  return { code: 422, failureCode: 'FUSION_REVISION_REJECTED', summary };
}
function prepareRevision(current: WorkspaceObject, body: ChangeInput) {
  const meta = current.metadata;
  if (!body.expectedSourceHashes ||
      meta.sourceHashes.build !== body.expectedSourceHashes.build ||
      meta.sourceHashes.loft !== body.expectedSourceHashes.loft) {
    throw new Error('FUSION_SOURCE_STALE');
  }
  const requested: FusionRevisionInput = {
    ...meta.sources, expectedSourceHashes: meta.sourceHashes,
    buildParameterId: body.buildParameterId, nextValue: body.nextValue,
    loftLink: body.loftLink,
  };
  const baseline = composeFirstFusion(meta.sources);
  const resolved = baseline.bindings.find((b) => {
    if (b.buildEntityId === undefined) return false;
    const original = baseline.objects.find((o) => o.id === b.loftOccurrenceId);
    return original?.metadata?.['sourceAssemblyId'] === body.loftLink.loftAssemblyId &&
      original?.metadata?.['sourceInstanceId'] === body.loftLink.loftInstanceId &&
      original?.metadata?.['sourcePartId'] === body.loftLink.loftPartId;
  });
  if (!resolved) throw new Error('FUSION_WORKSPACE_LOFT_BINDING_MISSING');
  const revision = deriveFusionSourceRevision(requested);
  const geometryBefore = previewSupportedLoftSolid({
    ...meta.sources, expectedSourceHashes: meta.sourceHashes,
    loftOccurrenceId: resolved.loftOccurrenceId,
  });
  const geometryAfter = previewSupportedLoftSolid({
    buildProject: revision.buildProject, loftProject: revision.loftProject,
    bindings: meta.sources.bindings, expectedSourceHashes: revision.revisedSources,
    loftOccurrenceId: resolved.loftOccurrenceId,
  });
  if (geometryBefore.compileHash === geometryAfter.compileHash)
    throw new Error('FUSION_REVISION_GEOMETRY_NOT_CHANGED');
  const sectionBefore = createFusionSectionSheet({
    loftProject: meta.sources.loftProject, sectionYmm: body.sectionYmm,
  });
  const sectionAfter = createFusionSectionSheet({
    loftProject: revision.loftProject, sectionYmm: body.sectionYmm,
  });
  if (sectionBefore.svg === sectionAfter.svg)
    throw new Error('FUSION_REVISION_SECTION_NOT_CHANGED_AT_SELECTED_CUT');
  if (sectionBefore.unsupported.length !== 0 || sectionAfter.unsupported.length !== 0)
    throw new Error('FUSION_REVISION_SECTION_HAS_UNSUPPORTED_PARTS');
  const candidateHash = hashSourceBytes(JSON.stringify({
    workspaceId: current.id,
    originalHashes: revision.originalSources,
    revisedHashes: revision.revisedSources,
    expectedHeadHash: body.expectedHeadHash,
    parameterId: body.buildParameterId,
    nextValue: body.nextValue,
    link: body.loftLink,
    sectionYmm: body.sectionYmm,
    beforeGeometry: geometryBefore.compileHash,
    afterGeometry: geometryAfter.compileHash,
    beforeSection: hashSourceBytes(sectionBefore.svg),
    afterSection: hashSourceBytes(sectionAfter.svg),
  }));
  return {
    revision, candidateHash, geometryBefore, geometryAfter,
    sectionBefore, sectionAfter,
  };
}

export function registerFusionWorkspaceRoutes(app: FastifyInstance, store: VersionStore): void {
  /** Save an explicit Build/Loft pair to the actual Plasma version store, once. */
  app.post<{ Body: HeadInput & FusionSourceBundle }>(
    '/imports/fusion/workspaces', async (req, reply) => {
      try {
        const body = req.body;
        await checkHead(store, body);
        boundedSize(body);
        const preview = composeFirstFusion(body);
        const id = workspaceIdFor(preview);
        if (await asPromise(store.getObject(body.branchId, id)))
          throw new Error('FUSION_WORKSPACE_ALREADY_EXISTS');
        const now = new Date().toISOString();
        const metadata: WorkspaceMeta = {
          contract: 'plasma.fusion.source-workspace/0.1',
          sources: {
            buildProject: structuredClone(body.buildProject),
            loftProject: structuredClone(body.loftProject),
            bindings: structuredClone(body.bindings ?? []),
          },
          sourceHashes: sourceHashes(preview), revision: 0,
        };
        const saved: WorkspaceObject = {
          id, kind: 'Model', semanticType: 'plasma.fusion.source-workspace',
          name: 'Imported Loft + Build sources',
          schemaVersion: '1.0.0', createdAt: now, updatedAt: now, metadata,
        };
        const event = await asPromise(store.upsertObject(
          body.branchId, { type: 'user', id: 'northstar-fusion' }, body.expectedHeadHash,
          saved as unknown as Record<string, unknown> & { id: string },
        ));
        return reply.code(201).send({
          status: 'source-workspace-saved', workspaceId: id, sourceHashes: metadata.sourceHashes,
          revision: 0, headHash: event.afterHash, eventId: event.eventId, publicationReady: false,
        });
      } catch (err) {
        const result = classifyError(err);
        return reply.code(result.code).send({ ...result, publicationReady: false });
      }
    },
  );
  app.get<{ Params: { workspaceId: string }; Querystring: { modelId: string; branchId: string } }>(
    '/imports/fusion/workspaces/:workspaceId', async (req, reply) => {
      try {
        const head = await asPromise(store.getBranchHead(req.query.branchId));
        if (head.modelId !== req.query.modelId) throw new Error('FUSION_HEAD_CONFLICT');
        const source = await loadWorkspace(store, req.params.workspaceId, req.query.branchId);
        return reply.send({
          workspaceId: source.id, headHash: head.headHash,
          sources: source.metadata.sources,
          revision: source.metadata.revision,
          sourceHashes: source.metadata.sourceHashes,
          lastChange: source.metadata.lastChange ?? null,
          preview: composeFirstFusion(source.metadata.sources),
          publicationReady: false,
        });
      } catch (err) {
        const result = classifyError(err);
        return reply.code(result.code).send({ ...result, publicationReady: false });
      }
    },
  );
  /** Dry run recomputes *both* geometry and material section with a pinned head. */
  app.post<{ Params: { workspaceId: string }; Body: ChangeInput }>(
    '/imports/fusion/workspaces/:workspaceId/revision-preview', async (req, reply) => {
      try {
        await checkHead(store, req.body);
        const current = await loadWorkspace(store, req.params.workspaceId, req.body.branchId);
        const prepared = prepareRevision(current, req.body);
        await checkHead(store, req.body);
        return reply.send({
          status: 'coordinated-source-preview', candidateHash: prepared.candidateHash,
          workspaceId: current.id, expectedHeadHash: req.body.expectedHeadHash,
          sourceHashesBefore: prepared.revision.originalSources,
          sourceHashesAfter: prepared.revision.revisedSources,
          affectedBuildEntities: prepared.revision.affectedBuildEntities,
          affectedLoftOccurrences: prepared.revision.affectedLoftOccurrences,
          geometry: {
            beforeHash: prepared.geometryBefore.compileHash,
            afterHash: prepared.geometryAfter.compileHash,
            before: prepared.geometryBefore.meshes, after: prepared.geometryAfter.meshes,
            kernel: 'exact-adapter', nativeBrepValidated: false,
          },
          drawing: {
            before: prepared.sectionBefore.svg, after: prepared.sectionAfter.svg,
            beforeHash: hashSourceBytes(prepared.sectionBefore.svg),
            afterHash: hashSourceBytes(prepared.sectionAfter.svg),
            scale: '1:5', issueStatus: 'preview-not-for-construction',
          },
          publicationReady: false,
          warning: 'Only a bounded source workspace revision; not a published or validated hotel BIM model',
        });
      } catch (err) {
        const result = classifyError(err);
        return reply.code(result.code).send({ ...result, publicationReady: false });
      }
    },
  );
  /** Requires an exact reviewed fingerprint, recompiles evidence and commits one
   * atomic source workspace object. Any stale branch or source aborts the write.
   */
  app.post<{ Params: { workspaceId: string }; Body: ChangeInput & { readonly candidateHash: string } }>(
    '/imports/fusion/workspaces/:workspaceId/revision-accept', async (req, reply) => {
      try {
        await checkHead(store, req.body);
        const current = await loadWorkspace(store, req.params.workspaceId, req.body.branchId);
        const prepared = prepareRevision(current, req.body);
        if (!req.body.candidateHash || prepared.candidateHash !== req.body.candidateHash)
          throw new Error('FUSION_CANDIDATE_STALE: recompute preview');
        const next: WorkspaceObject = {
          ...current, updatedAt: new Date().toISOString(),
          metadata: {
            ...current.metadata,
            sources: {
              buildProject: prepared.revision.buildProject,
              loftProject: prepared.revision.loftProject,
              bindings: current.metadata.sources.bindings,
            },
            sourceHashes: prepared.revision.revisedSources,
            revision: current.metadata.revision + 1,
            lastChange: {
              buildParameterId: req.body.buildParameterId,
              valueBefore: prepared.geometryBefore.meshes.length ? (
                composeFirstFusion(current.metadata.sources).parameters.find(p => p.id === req.body.buildParameterId)?.quantity.value ?? NaN
              ) : NaN,
              valueAfter: req.body.nextValue,
              parameterUnit: 'mm',
              candidateHash: prepared.candidateHash,
              afterGeometryHash: prepared.geometryAfter.compileHash,
              afterSectionHash: hashSourceBytes(prepared.sectionAfter.svg),
              acceptedAt: new Date().toISOString(),
            },
          },
        };
        const event = await asPromise(store.upsertObject(
          req.body.branchId, { type: 'user', id: 'northstar-fusion' },
          req.body.expectedHeadHash,
          next as unknown as Record<string, unknown> & { id: string },
        ));
        const accepted = composeFirstFusion(next.metadata.sources);
        return reply.send({
          status: 'source-revision-accepted', workspaceId: next.id,
          sourceHashes: next.metadata.sourceHashes,
          revision: next.metadata.revision,
          headHash: event.afterHash, eventId: event.eventId,
          acceptedGeometryHash: prepared.geometryAfter.compileHash,
          acceptedDrawingHash: hashSourceBytes(prepared.sectionAfter.svg),
          sources: next.metadata.sources,
          preview: accepted,
          publicationReady: false,
          warning: 'Source-only revision accepted. Native OCCT and professional BIM approval remain open.',
        });
      } catch (err) {
        const result = classifyError(err);
        return reply.code(result.code).send({ ...result, publicationReady: false });
      }
    },
  );
}
