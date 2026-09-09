import Fastify from 'fastify';
import cors from '@fastify/cors';
import { InMemoryVersionStore, asPromise, type VersionStore } from '@spds/version-core';
import {
  buildSchemaPayload,
  parseSemanticObject,
  schemaPayloadToAiCatalog,
} from '@spds/semantic-core';
import {
  QueryAstSchema,
  executeQuery,
  controllingParameters,
  explainObject,
  traceLineage,
  upstream as queryUpstream,
  downstream as queryDownstream,
} from '@spds/semantic-query';
import { ModelQueryContextRegistry, buildLiveD01QueryContext } from './model-query-context.js';
import {
  WhatIfCloneRejectedError,
  WhatIfDraftRejectedError,
  regenerateWhatIfPreview,
} from './what-if-regen.js';
import { gateWhatIfRegen } from './what-if-gate.js';
import { createModelGroup, reparentModelNode, serializeGraphObjects } from './model-groups.js';
import {
  loadOrganisationFromStore,
  mergeOrganisationFromSources,
  persistOrganisationSnapshot,
} from './model-organisation-persist.js';
import { loadGeometryFromStore } from './model-geometry-persist.js';
import { DesignCommandSchema, TransactionEngine } from '@spds/transaction-core';
import { runAnalysisJob } from '@spds/analysis-worker';
import { InMemoryObjectStore, MinioObjectStore, minioConfigFromEnv } from '@spds/artifact-store';
import { buildA01AssemblyFixture } from '@spds/assembly-core';
import { runStepImportJob } from '@spds/import-worker';
import {
  buildLiveReferenceCompletenessSuite,
  runA01ReferencePipeline,
  runD01ReferencePipeline,
  runF01ReferencePipeline,
} from '@spds/reference-pipeline';
import {
  CREATE_KINDS_ALLOWLIST,
  DEFAULT_ACCEPT_OPS,
  DEFAULT_UNSUPPORTED_OPS,
  agentParametersFromPattern,
  impactPreview,
  runAgent,
  validateChangeSet,
  type AgentRunMode,
  type ChangeSet,
} from '@spds/ai-interface';
import { loadGoldbergPatternManifest } from '@spds/pattern-goldberg-cellular-topology';
import {
  acceptSemanticCommand,
  parseSemanticCommand,
  toDesignCommandPayload,
} from '@spds/semantic-commands';
import { acceptAiChangeSet, ensureAiBranchContext } from './ai-changeset-accept.js';
import { BranchUndoRegistry } from './branch-undo.js';
import { extractD01GeometryParams } from './d01-candidate-params.js';
import { buildD01DisplayMeshesMaybeCompare } from './display-meshes-compare.js';
import { GeometryClient } from '@spds/geometry-client';
import {
  InProcessGeometryKernel,
  MeasureRequestSchema,
  compareMeasureResults,
  type MeasureResult,
} from '@spds/geometry-contracts';
import { deriveYComponentArmSegments } from '@spds/topology-operators';
import {
  InMemoryUiPreferencesStore,
  UI_PREFERENCES_SCHEMA_VERSION,
  type UiPreferencesPayload,
  type UiPreferencesStore,
} from './db/ui-preferences-store.js';

export interface BuildServerOptions {
  readonly uiPreferences?: UiPreferencesStore;
  /** When true, registers unit G3b under model:fixture for legacy unit tests. */
  readonly seedUnitFixture?: boolean;
  readonly queryContexts?: ModelQueryContextRegistry;
}

function buildPatternMutateSlice(values: Readonly<Record<string, unknown>> = {}) {
  return {
    acceptOps: [...DEFAULT_ACCEPT_OPS],
    unsupportedOps: [...DEFAULT_UNSUPPORTED_OPS],
    kindsAllowlist: [...CREATE_KINDS_ALLOWLIST],
    parameters: agentParametersFromPattern(loadGoldbergPatternManifest(), values),
    examples: [],
    worldNotes:
      'Three.js camera is Y-up for display only; mutate semantic WORLD (+Z) using package-declared units.',
  };
}

export function buildServer(
  storeInput: VersionStore | undefined = undefined,
  options: BuildServerOptions = {},
) {
  const store = storeInput ?? new InMemoryVersionStore();
  const app = Fastify({ logger: false });
  void app.register(cors, { origin: true });
  const uiPreferences = options.uiPreferences ?? new InMemoryUiPreferencesStore();
  const queryContexts = options.queryContexts ?? new ModelQueryContextRegistry();
  if (options.seedUnitFixture) {
    queryContexts.seedUnitG3b('model:fixture');
  }
  const txEngine = new TransactionEngine(store);
  const undoRegistry = new BranchUndoRegistry(store);
  txEngine.setCompileAdapter(async ({ candidate }) => {
    const params = extractD01GeometryParams(candidate.objects);
    try {
      const pipeline = await runD01ReferencePipeline({
        yLimit: 2,
        lengthMm: params.lengthMm,
        armWidthMm: params.armWidthMm,
        structuralDepthMm: params.structuralDepthMm,
        frequency: params.frequency,
        diameterMm: params.diameterMm,
        riseRatio: params.riseRatio,
      });
      return {
        ok: pipeline.release.status === 'published',
        pirHash: pipeline.pirHash,
        dagHash: pipeline.dagHash,
        validationHash: pipeline.pipelineHash,
        artifactHashes: [pipeline.pipelineHash],
        pipelineHash: pipeline.pipelineHash,
      };
    } catch {
      return {
        ok: false,
        pirHash: 'fail',
        dagHash: 'fail',
        validationHash: 'fail',
        artifactHashes: [],
        failAt: 'geometry' as const,
      };
    }
  });
  const a01 = buildA01AssemblyFixture();
  const artifacts = new InMemoryObjectStore();
  const minioCfg = minioConfigFromEnv();
  const remoteArtifacts = minioCfg ? new MinioObjectStore(minioCfg) : undefined;

  app.get('/health', async () => ({ status: 'ok', service: 'spds-api' }));

  app.post<{ Body: { name: string } }>('/models', async (req, reply) => {
    const model = await asPromise(store.createModel(req.body.name));
    const branchId = store.getMainBranchId(model.modelId);
    const head = await asPromise(store.getBranchHead(branchId));
    return reply.code(201).send({
      model,
      branchId,
      headHash: head.headHash,
    });
  });

  app.get<{ Params: { modelId: string; branchId: string } }>(
    '/models/:modelId/branches/:branchId/objects',
    async (req) => ({ objects: await asPromise(store.listObjects(req.params.branchId)) }),
  );

  app.post<{
    Params: { modelId: string; branchId: string };
    Body: { expectedHeadHash: string; object: unknown; actorId?: string };
  }>('/models/:modelId/branches/:branchId/objects', async (req, reply) => {
    const object = parseSemanticObject(req.body.object);
    const event = await asPromise(
      store.upsertObject(
        req.params.branchId,
        { type: 'user', id: req.body.actorId ?? 'api-user' },
        req.body.expectedHeadHash,
        object as Record<string, unknown> & { id: string },
      ),
    );
    return reply.code(201).send({ event, headHash: event.afterHash, object });
  });

  app.post<{
    Params: { modelId: string; branchId: string };
    Body: { name?: string };
  }>('/models/:modelId/branches/:branchId/snapshots', async (req, reply) => {
    const snap = await asPromise(store.snapshot(req.params.branchId, req.body?.name));
    return reply.code(201).send({ snapshot: snap });
  });

  app.post<{
    Params: { modelId: string };
    Body: { name: string; fromBranchId: string };
  }>('/models/:modelId/branches', async (req, reply) => {
    const branch = await asPromise(
      store.createBranch(req.params.modelId, req.body.name, req.body.fromBranchId),
    );
    return reply.code(201).send({ branch });
  });

  app.post<{
    Params: { modelId: string; branchId: string };
    Body: { snapshotId: string; actorId?: string };
  }>('/models/:modelId/branches/:branchId/restore', async (req, reply) => {
    const event = await asPromise(
      store.restoreToNewHead(req.params.branchId, req.body.snapshotId, {
        type: 'user',
        id: req.body.actorId ?? 'api-user',
      }),
    );
    return reply.send({ event, headHash: event.afterHash });
  });

  app.get<{ Params: { modelId: string; branchId: string } }>(
    '/models/:modelId/branches/:branchId/head',
    async (req) => ({ branch: await asPromise(store.getBranchHead(req.params.branchId)) }),
  );

  app.get<{ Params: { modelId: string; branchId: string } }>(
    '/models/:modelId/branches/:branchId/events',
    async (req) => ({ events: await asPromise(store.listEvents(req.params.branchId)) }),
  );

  app.post<{
    Params: { modelId: string };
    Body?: { yLimit?: number; lengthMm?: number };
  }>('/models/:modelId/substrate/d01', async (req, reply) => {
    const geom = await loadGeometryFromStore(store, req.params.modelId);
    const built = await buildLiveD01QueryContext(req.params.modelId, {
      yLimit: req.body?.yLimit ?? 5,
      lengthMm: req.body?.lengthMm ?? geom.lengthMm,
      armWidthMm: geom.armWidthMm,
      structuralDepthMm: geom.structuralDepthMm,
      frequency: geom.frequency,
      diameterMm: geom.diameterMm,
      riseRatio: geom.riseRatio,
    });
    const stored = await loadOrganisationFromStore(store, req.params.modelId);
    const ctx = mergeOrganisationFromSources(built, queryContexts.get(req.params.modelId), stored);
    queryContexts.set(ctx);
    return reply.code(201).send({
      modelId: ctx.modelId,
      source: ctx.source,
      pipelineHash: ctx.pipelineHash,
      meshCount: ctx.displayMeshes.length,
      semanticOwners: ctx.displayMeshes.map((m) => m.semanticOwner),
      objectCount: ctx.graph.all().length,
      parameters: ctx.parameters,
    });
  });

  app.get<{ Params: { modelId: string } }>('/models/:modelId/substrate', async (req, reply) => {
    let ctx = queryContexts.get(req.params.modelId);
    if (!ctx) {
      // Cold start after API restart: rebuild D01 + reload durable organisation/geometry.
      try {
        const geom = await loadGeometryFromStore(store, req.params.modelId);
        const built = await buildLiveD01QueryContext(req.params.modelId, {
          yLimit: 5,
          lengthMm: geom.lengthMm,
          armWidthMm: geom.armWidthMm,
          structuralDepthMm: geom.structuralDepthMm,
          frequency: geom.frequency,
          diameterMm: geom.diameterMm,
          riseRatio: geom.riseRatio,
        });
        const stored = await loadOrganisationFromStore(store, req.params.modelId);
        ctx = mergeOrganisationFromSources(built, null, stored);
        queryContexts.set(ctx);
      } catch {
        return reply.code(404).send({
          error: 'model_query_context_not_found',
          modelId: req.params.modelId,
        });
      }
    }
    return reply.send({
      modelId: ctx.modelId,
      source: ctx.source,
      pipelineHash: ctx.pipelineHash,
      meshCount: ctx.displayMeshes.length,
      meshes: ctx.displayMeshes.map((m) => ({
        representationId: m.representationId,
        semanticOwner: m.semanticOwner,
        triangleCount: m.triangleCount,
      })),
      objects: serializeGraphObjects(ctx),
      dependencyEdges: ctx.dependencyEdges,
      objectCount: ctx.graph.all().length,
      parameters: ctx.parameters,
    });
  });

  /** Static catalog (no model required) — Schema View always has something to show. */
  app.get('/schema', async (_req, reply) => {
    const t0 = performance.now();
    const payload = buildSchemaPayload([]);
    return reply.send({
      modelId: null,
      live: false,
      ...payload,
      mutate: buildPatternMutateSlice(),
      assembleMs: performance.now() - t0,
    });
  });

  app.get<{ Params: { modelId: string } }>('/models/:modelId/schema', async (req, reply) => {
    let ctx = queryContexts.get(req.params.modelId);
    if (!ctx) {
      try {
        const built = await buildLiveD01QueryContext(req.params.modelId, { yLimit: 5 });
        const stored = await loadOrganisationFromStore(store, req.params.modelId);
        ctx = mergeOrganisationFromSources(built, null, stored);
        queryContexts.set(ctx);
      } catch {
        ctx = null;
      }
    }
    const t0 = performance.now();
    const liveObjects = ctx
      ? ctx.graph.all().map((o) => ({
          id: o.id,
          semanticType: o.semanticType,
          tags: o.tags ?? [],
          attributes: o.attributes ?? {},
        }))
      : [];
    const payload = buildSchemaPayload(liveObjects);
    const assembleMs = performance.now() - t0;
    return reply.send({
      modelId: req.params.modelId,
      live: Boolean(ctx),
      contextMissing: !ctx,
      ...payload,
      mutate: buildPatternMutateSlice(ctx?.parameters ?? {}),
      assembleMs,
    });
  });

  app.post<{
    Params: { modelId: string };
    Body: { label?: string; parentId?: string };
  }>('/models/:modelId/groups', async (req, reply) => {
    const ctx = queryContexts.get(req.params.modelId);
    if (!ctx) {
      return reply.code(404).send({
        error: 'model_query_context_not_found',
        modelId: req.params.modelId,
      });
    }
    const result = createModelGroup(ctx, {
      ...(req.body?.label !== undefined ? { label: req.body.label } : {}),
      ...(req.body?.parentId !== undefined ? { parentId: req.body.parentId } : {}),
    });
    if (!result.ok) {
      const code = result.error === 'cycle' ? 400 : 400;
      return reply.code(code).send({ error: result.error, modelId: req.params.modelId });
    }
    queryContexts.set(result.ctx);
    await persistOrganisationSnapshot(store, req.params.modelId, result.ctx);
    return reply.code(201).send({
      modelId: req.params.modelId,
      groupId: result.groupId,
      objects: serializeGraphObjects(result.ctx),
    });
  });

  app.post<{
    Params: { modelId: string };
    Body: { nodeId: string; newParentId: string };
  }>('/models/:modelId/groups/reparent', async (req, reply) => {
    const ctx = queryContexts.get(req.params.modelId);
    if (!ctx) {
      return reply.code(404).send({
        error: 'model_query_context_not_found',
        modelId: req.params.modelId,
      });
    }
    const nodeId = req.body?.nodeId;
    const newParentId = req.body?.newParentId;
    if (typeof nodeId !== 'string' || typeof newParentId !== 'string') {
      return reply.code(400).send({ error: 'invalid_body', modelId: req.params.modelId });
    }
    const result = reparentModelNode(ctx, { nodeId, newParentId });
    if (!result.ok) {
      const status =
        result.error === 'node_not_found' || result.error === 'parent_not_found' ? 400 : 400;
      return reply.code(status).send({ error: result.error, modelId: req.params.modelId });
    }
    queryContexts.set(result.ctx);
    await persistOrganisationSnapshot(store, req.params.modelId, result.ctx);
    return reply.send({
      modelId: req.params.modelId,
      nodeId,
      newParentId,
      objects: serializeGraphObjects(result.ctx),
    });
  });

  app.post<{ Params: { modelId: string }; Body: unknown }>(
    '/models/:modelId/query',
    async (req, reply) => {
      const ctx = queryContexts.get(req.params.modelId);
      if (!ctx) {
        return reply.code(404).send({
          error: 'model_query_context_not_found',
          modelId: req.params.modelId,
        });
      }
      const ast = QueryAstSchema.parse(req.body);
      return reply.send({ modelId: req.params.modelId, result: executeQuery(ctx.graph, ast) });
    },
  );

  app.post<{
    Params: { modelId: string };
    Body: { targetId: string; changedParameters?: string[] };
  }>('/models/:modelId/explain', async (req, reply) => {
    const ctx = queryContexts.get(req.params.modelId);
    if (!ctx) {
      return reply.code(404).send({
        error: 'model_query_context_not_found',
        modelId: req.params.modelId,
      });
    }
    if (!ctx.graph.get(req.body.targetId)) {
      return reply.code(404).send({
        error: 'semantic_object_not_found',
        modelId: req.params.modelId,
        targetId: req.body.targetId,
      });
    }
    const packet = explainObject({
      targetId: req.body.targetId,
      graph: ctx.graph,
      provenance: ctx.provenance,
      dependencyEdges: ctx.dependencyEdges,
      ...(req.body.changedParameters !== undefined
        ? { changedParameters: req.body.changedParameters }
        : {}),
    });
    return reply.send({ modelId: req.params.modelId, explain: packet, source: ctx.source });
  });

  app.post<{ Params: { modelId: string }; Body: { semanticAnchor: string } }>(
    '/models/:modelId/trace',
    async (req, reply) => {
      const ctx = queryContexts.get(req.params.modelId);
      if (!ctx) {
        return reply.code(404).send({
          error: 'model_query_context_not_found',
          modelId: req.params.modelId,
        });
      }
      const steps = traceLineage(ctx.provenance, req.body.semanticAnchor);
      return reply.send({ modelId: req.params.modelId, trace: steps, source: ctx.source });
    },
  );

  app.post<{
    Params: { modelId: string };
    Body: { objectId: string; radius?: number; relationTypes?: string[] };
  }>('/models/:modelId/upstream', async (req, reply) => {
    const ctx = queryContexts.get(req.params.modelId);
    if (!ctx) {
      return reply.code(404).send({
        error: 'model_query_context_not_found',
        modelId: req.params.modelId,
      });
    }
    const ids = queryUpstream(
      ctx.dependencyEdges,
      req.body.objectId,
      req.body.radius ?? 1,
      req.body.relationTypes,
    );
    return reply.send({
      modelId: req.params.modelId,
      objectId: req.body.objectId,
      direction: 'upstream',
      radius: req.body.radius ?? 1,
      ids,
      source: ctx.source,
    });
  });

  app.post<{
    Params: { modelId: string };
    Body: { objectId: string; radius?: number; relationTypes?: string[] };
  }>('/models/:modelId/downstream', async (req, reply) => {
    const ctx = queryContexts.get(req.params.modelId);
    if (!ctx) {
      return reply.code(404).send({
        error: 'model_query_context_not_found',
        modelId: req.params.modelId,
      });
    }
    const ids = queryDownstream(
      ctx.dependencyEdges,
      req.body.objectId,
      req.body.radius ?? 1,
      req.body.relationTypes,
    );
    return reply.send({
      modelId: req.params.modelId,
      objectId: req.body.objectId,
      direction: 'downstream',
      radius: req.body.radius ?? 1,
      ids,
      source: ctx.source,
    });
  });

  app.post<{
    Params: { modelId: string };
    Body: { objectId: string; radius?: number };
  }>('/models/:modelId/controlling-parameters', async (req, reply) => {
    const ctx = queryContexts.get(req.params.modelId);
    if (!ctx) {
      return reply.code(404).send({
        error: 'model_query_context_not_found',
        modelId: req.params.modelId,
      });
    }
    const result = controllingParameters({
      objectId: req.body.objectId,
      dependencyEdges: ctx.dependencyEdges,
      graph: ctx.graph,
      radius: req.body.radius ?? 4,
    });
    return reply.send({
      modelId: req.params.modelId,
      objectId: req.body.objectId,
      ...result,
      source: ctx.source,
    });
  });

  app.post<{
    Params: { modelId: string };
    Body: {
      branchId: string;
      baselineHash: string;
      draft: { parameterId: string; value: unknown } | { changeSetId: string };
      yLimit?: number;
      armWidthMm?: number;
      structuralDepthMm?: number;
      /** Test-only: attempt forbidden clone mode (must 400). */
      modeAttempt?: string;
    };
  }>('/models/:modelId/what-if', async (req, reply) => {
    const ctx = queryContexts.get(req.params.modelId);
    if (!ctx) {
      return reply.code(404).send({
        error: 'model_query_context_not_found',
        modelId: req.params.modelId,
      });
    }
    try {
      const result = await regenerateWhatIfPreview({
        request: {
          modelId: req.params.modelId,
          branchId: req.body.branchId,
          draft: req.body.draft,
        },
        baselineHash: req.body.baselineHash,
        baselineMeshes: (ctx.displayMeshes ?? []).map((m) => ({
          representationId: m.representationId,
          semanticOwner: m.semanticOwner,
          vertices: m.vertices,
          indices: m.indices,
          triangleCount: m.triangleCount,
        })),
        ...(req.body.yLimit !== undefined ? { yLimit: req.body.yLimit } : {}),
        ...(req.body.armWidthMm !== undefined ? { armWidthMm: req.body.armWidthMm } : {}),
        ...(req.body.structuralDepthMm !== undefined
          ? { structuralDepthMm: req.body.structuralDepthMm }
          : {}),
        ...(req.body.modeAttempt !== undefined ? { modeAttempt: req.body.modeAttempt } : {}),
      });
      const gate = gateWhatIfRegen({
        regenMs: result.regenMs,
        source: 'd01-reference-pipeline',
        usedDemoMeshes: false,
        // Exact-adapter path is always available; OCCT compare is optional.
        occtAvailable: true,
      });
      if (!gate.ok && gate.reason === 'budget_exceeded') {
        return reply.code(504).send({
          error: 'whatif_budget_exceeded',
          detail: gate.detail,
          regenMs: result.regenMs,
        });
      }
      return reply.send({
        modelId: req.params.modelId,
        whatIf: result.whatIf,
        meshes: result.meshes,
        pipelineHash: result.pipelineHash,
        regenMs: result.regenMs,
        extents: result.extents,
        byteFingerprint: result.byteFingerprint,
        source: 'regenerated-preview',
        gate,
      });
    } catch (err) {
      if (err instanceof WhatIfCloneRejectedError) {
        return reply.code(400).send({ error: err.code, message: err.message });
      }
      if (err instanceof WhatIfDraftRejectedError) {
        return reply
          .code(422)
          .send({ error: err.code, failureCode: err.code, message: err.message });
      }
      throw err;
    }
  });

  /** T8 — ChangeSet-only hydrate (no markdown / mesh buffers / fabricationReady). */
  app.post<{
    Params: { modelId: string };
    Body: {
      schemaVersion?: string;
      changeSet: ChangeSet;
      expectedHeadHash?: string;
      yLimit?: number;
    };
  }>('/models/:modelId/hydrate', async (req, reply) => {
    const contentType = String(req.headers['content-type'] ?? '');
    if (contentType.includes('text/markdown') || contentType.includes('text/md')) {
      return reply
        .code(415)
        .send({ error: 'markdown_forbidden', failureCode: 'MARKDOWN_FORBIDDEN' });
    }
    const body = req.body as Record<string, unknown>;
    if (
      body &&
      (body.meshes !== undefined || body.fabricationReady === true || body.snapshot !== undefined)
    ) {
      return reply.code(422).send({
        error: 'hydrate_forbidden_fields',
        failureCode: 'FORBIDDEN_FIELDS',
        reason: 'hydrate rejects meshes, fabricationReady, and snapshot bulk upload',
      });
    }
    const cs = req.body.changeSet;
    if (!cs || typeof cs !== 'object') {
      return reply
        .code(400)
        .send({ error: 'changeset_required', failureCode: 'CHANGESET_REQUIRED' });
    }
    const tValidate = performance.now();
    const v = validateChangeSet(cs);
    if (!v.ok) {
      return reply.code(422).send({
        error: 'changeset_invalid',
        failureCode: 'CHANGESET_INVALID',
        reason: v.reason,
        validateMs: performance.now() - tValidate,
      });
    }
    if (performance.now() - tValidate > 20 && cs.commands.length <= 100) {
      /* soft bench — still proceed */
    }
    const impact = impactPreview(cs);
    // Ensure substrate exists for organise ops / explain after hydrate.
    if (!queryContexts.get(req.params.modelId)) {
      const geom = await loadGeometryFromStore(store, req.params.modelId);
      const built = await buildLiveD01QueryContext(req.params.modelId, {
        yLimit: req.body.yLimit ?? 3,
        lengthMm: geom.lengthMm,
        armWidthMm: geom.armWidthMm,
        structuralDepthMm: geom.structuralDepthMm,
        frequency: geom.frequency,
        diameterMm: geom.diameterMm,
        riseRatio: geom.riseRatio,
      });
      const stored = await loadOrganisationFromStore(store, req.params.modelId);
      queryContexts.set(mergeOrganisationFromSources(built, null, stored));
    }
    const result = await acceptAiChangeSet({
      store,
      txEngine,
      queryContexts,
      undoRegistry,
      body: {
        changeSet: cs,
        ...(req.body.expectedHeadHash !== undefined
          ? { expectedHeadHash: req.body.expectedHeadHash }
          : {}),
        ...(req.body.yLimit !== undefined ? { yLimit: req.body.yLimit } : { yLimit: 3 }),
        modelId: req.params.modelId,
      },
    });
    return reply.code(result.httpStatus).send({
      ...result.body,
      schemaVersion: req.body.schemaVersion ?? 'hydrate/1',
      impact,
      hydrated: result.body.status === 'applied',
    });
  });

  app.post<{
    Params: { modelId: string };
    Body: {
      branchId: string;
      actorId: string;
      actorType: 'user' | 'ai' | 'system';
      expectedHeadHash: string;
      idempotencyKey: string;
    };
  }>('/models/:modelId/transactions', async (req, reply) => {
    const txn = await txEngine.begin({
      modelId: req.params.modelId,
      branchId: req.body.branchId,
      actorId: req.body.actorId,
      actorType: req.body.actorType,
      expectedHeadHash: req.body.expectedHeadHash,
      idempotencyKey: req.body.idempotencyKey,
    });
    return reply.code(201).send({ transaction: txn });
  });

  app.post<{
    Params: { modelId: string; txnId: string };
    Body: unknown;
  }>('/models/:modelId/transactions/:txnId/commands', async (req, reply) => {
    const command = DesignCommandSchema.parse(req.body);
    const txn = txEngine.appendCommand(req.params.txnId, command);
    return reply.code(201).send({ transaction: txn });
  });

  app.post<{ Params: { modelId: string; txnId: string } }>(
    '/models/:modelId/transactions/:txnId/abort',
    async (req, reply) => {
      const txn = txEngine.abort(req.params.txnId);
      return reply.send({ transaction: txn });
    },
  );

  app.post<{ Params: { modelId: string; txnId: string } }>(
    '/models/:modelId/transactions/:txnId/validate',
    async (req, reply) => {
      const candidate = await txEngine.buildCandidate(req.params.txnId);
      return reply.send({ candidate, transaction: txEngine.getTransaction(req.params.txnId) });
    },
  );

  app.post<{
    Params: { modelId: string; txnId: string };
    Body: { failAt?: 'geometry' | 'validation' | 'pir' };
  }>('/models/:modelId/transactions/:txnId/compile', async (req, reply) => {
    try {
      const manifest = await txEngine.compile(req.params.txnId, {
        ...(req.body?.failAt ? { failAt: req.body.failAt } : {}),
      });
      return reply.send({ manifest, transaction: txEngine.getTransaction(req.params.txnId) });
    } catch (err) {
      return reply.code(422).send({
        error: err instanceof Error ? err.message : 'compile failed',
        transaction: txEngine.getTransaction(req.params.txnId),
      });
    }
  });

  app.post<{ Params: { modelId: string; txnId: string } }>(
    '/models/:modelId/transactions/:txnId/commit',
    async (req, reply) => {
      try {
        const transaction = await txEngine.commit(req.params.txnId);
        return reply.send({ transaction });
      } catch (err) {
        return reply.code(422).send({
          error: err instanceof Error ? err.message : 'commit failed',
          transaction: txEngine.getTransaction(req.params.txnId),
        });
      }
    },
  );

  app.get('/assemblies/a01/inspector', async (_req, reply) => {
    return reply.send({
      inspector: a01.registry.inspector(),
      frames: a01.frames,
      transforms: a01.transforms,
      importPlaceholder: a01.importPlaceholder,
    });
  });

  app.post<{
    Body: {
      yLimit?: number;
      lengthMmOverride?: number;
      lengthMm?: number;
      armWidthMm?: number;
      structuralDepthMm?: number;
      compareEngines?: boolean;
    };
  }>('/references/d01/display-meshes', async (req, reply) => {
    const lengthMm = req.body?.lengthMm ?? req.body?.lengthMmOverride;
    const result = await buildD01DisplayMeshesMaybeCompare({
      yLimit: req.body?.yLimit ?? 5,
      ...(lengthMm !== undefined ? { lengthMm } : {}),
      ...(req.body?.armWidthMm !== undefined ? { armWidthMm: req.body.armWidthMm } : {}),
      ...(req.body?.structuralDepthMm !== undefined
        ? { structuralDepthMm: req.body.structuralDepthMm }
        : {}),
      ...(req.body?.compareEngines ? { compareEngines: true } : {}),
    });
    return reply.code(201).send(result);
  });

  app.post<{
    Body: { intent?: string; mode?: AgentRunMode; modelId?: string };
  }>('/ai/agent/run', async (req, reply) => {
    const mode = req.body?.mode ?? 'auto';
    const intent = req.body?.intent;
    const modelId = req.body?.modelId;
    const ctx = typeof modelId === 'string' ? queryContexts.get(modelId) : null;
    const liveObjects =
      ctx?.graph.all().map((o) => ({
        id: o.id,
        semanticType: o.semanticType,
        tags: o.tags ?? [],
        attributes: o.attributes ?? {},
      })) ?? [];
    const schemaPayload =
      liveObjects.length > 0 ? buildSchemaPayload(liveObjects) : buildSchemaPayload([]);
    const catalog =
      liveObjects.length > 0 ? schemaPayloadToAiCatalog(schemaPayload, liveObjects) : undefined;

    // T0b: bind live AI branch head when possible so proposals are accept-ready.
    const aiCtx = await ensureAiBranchContext(store);
    const aiHead = (await asPromise(store.getBranchHead(aiCtx.aiBranchId))).headHash;
    const branchBinding = {
      modelId: typeof modelId === 'string' && modelId.length > 0 ? modelId : aiCtx.modelId,
      branchId: aiCtx.aiBranchId,
      sourceBranchId: aiCtx.mainBranchId,
      expectedHeadHash: aiHead,
      transactionId: `txn:agent:${Date.now()}`,
    };
    const parameterValues = queryContexts.get(branchBinding.modelId)?.parameters ?? {};
    const parameters = agentParametersFromPattern(loadGoldbergPatternManifest(), parameterValues);

    const result = await runAgent({
      mode,
      ...(intent !== undefined ? { intent } : {}),
      ...(catalog !== undefined ? { catalog } : {}),
      branchBinding,
      folderIds: schemaPayload.organisation.folderIds,
      parameters,
      compile: async (opts) => {
        const pipeline = await runD01ReferencePipeline({
          yLimit: 2,
          ...(opts?.lengthMm !== undefined ? { lengthMm: opts.lengthMm } : {}),
        });
        return {
          ok: pipeline.release.status === 'published',
          pirHash: pipeline.pirHash,
          pipelineHash: pipeline.pipelineHash,
          compileHash: pipeline.compileHash,
          parameters: pipeline.compileRequest.parameters,
          issueCount: 0,
        };
      },
    });
    if (result.error === 'SPDS_AI_API_KEY not configured (llm mode requires a key)') {
      return reply.code(503).send(result);
    }
    return reply.code(201).send(result);
  });

  app.post<{ Body: { yLimit?: number; attachOcctHashes?: boolean } }>(
    '/references/d01/publish',
    async (req, reply) => {
      const yLimit = req.body?.yLimit ?? 5;
      const attachOcct = req.body?.attachOcctHashes === true;
      let pipeline = await runD01ReferencePipeline({ yLimit });
      if (attachOcct) {
        try {
          const baseUrl =
            process.env['GEOMETRY_URL'] ??
            process.env['SPDS_GEOMETRY_URL'] ??
            'http://127.0.0.1:7080';
          const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/compile/meshes`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              compile: pipeline.compileRequest,
              kernels: ['occt-native', 'occt-wasm'],
            }),
          });
          if (res.ok) {
            const body = (await res.json()) as {
              occt?: { stepHashes?: string[] };
              occtNative?: { stepHashes?: string[] };
            };
            const occtNativeStepHashes = body.occtNative?.stepHashes;
            const occtWasmStepHashes = body.occt?.stepHashes;
            if (
              (occtNativeStepHashes && occtNativeStepHashes.length > 0) ||
              (occtWasmStepHashes && occtWasmStepHashes.length > 0)
            ) {
              pipeline = await runD01ReferencePipeline({
                yLimit,
                ...(occtWasmStepHashes?.length ? { occtWasmStepHashes } : {}),
                ...(occtNativeStepHashes?.length ? { occtNativeStepHashes } : {}),
              });
            }
          }
        } catch {
          // Manifest keeps explicit occtNote when OCCT unavailable.
        }
      }
      const stored = [];
      for (const art of pipeline.fabrication.artifacts) {
        const bytes = JSON.stringify(art);
        const put = artifacts.put(bytes, 'application/json', ['d01', 'release']);
        let remoteVerified: boolean | null = null;
        if (remoteArtifacts) {
          try {
            const remote = await remoteArtifacts.put(bytes, 'application/json', ['d01', 'release']);
            remoteVerified = await remoteArtifacts.verify(remote.contentHash);
          } catch {
            remoteVerified = false;
          }
        }
        stored.push({
          artifactId: art.artifactId,
          contentHash: put.contentHash,
          verified: artifacts.verify(put.contentHash),
          remoteVerified,
        });
      }
      // Persist compile/mesh hash metadata (buffers disposable; hashes durable).
      const metaBytes = JSON.stringify({
        compileHash: pipeline.compileHash,
        pirHash: pipeline.pirHash,
        dagHash: pipeline.dagHash,
        kernelArtifactHashes: pipeline.release.manifest.kernelArtifactHashes,
        exactMeshHashes: pipeline.release.manifest.kernelArtifactHashes?.exact ?? [],
      });
      const metaPut = artifacts.put(metaBytes, 'application/json', ['d01', 'compile-meta']);
      stored.push({
        artifactId: `compile-meta:${pipeline.compileHash.slice(0, 16)}`,
        contentHash: metaPut.contentHash,
        verified: artifacts.verify(metaPut.contentHash),
        remoteVerified: null as boolean | null,
      });

      return reply.code(201).send({
        release: pipeline.release,
        pipelineHash: pipeline.pipelineHash,
        pirHash: pipeline.pirHash,
        dagHash: pipeline.dagHash,
        compileHash: pipeline.compileHash,
        stored,
        allVerified: stored.every((s) => s.verified),
        remoteStore: remoteArtifacts ? 'minio' : 'none',
      });
    },
  );

  app.post('/references/a01/publish', async (_req, reply) => {
    const pipeline = await runA01ReferencePipeline();
    const stored = pipeline.representations.map((rep) => {
      const put = artifacts.put(JSON.stringify(rep), 'application/json', ['a01', 'release']);
      return {
        representationId: rep.id,
        contentHash: put.contentHash,
        verified: artifacts.verify(put.contentHash),
      };
    });
    return reply.code(201).send({
      release: pipeline.release,
      pipelineHash: pipeline.pipelineHash,
      instanceCount: pipeline.instanceCount,
      mateCount: pipeline.mateCount,
      stored,
      allVerified: stored.every((s) => s.verified),
    });
  });

  app.post('/references/f01/publish', async (_req, reply) => {
    const pipeline = await runF01ReferencePipeline();
    const stored = pipeline.representations.map((rep) => {
      const put = artifacts.put(JSON.stringify(rep), 'application/json', ['f01', 'release']);
      return {
        representationId: rep.id,
        contentHash: put.contentHash,
        verified: artifacts.verify(put.contentHash),
      };
    });
    return reply.code(201).send({
      release: pipeline.release,
      pipelineHash: pipeline.pipelineHash,
      panelCount: pipeline.panelCount,
      usesDomeImports: pipeline.usesDomeImports,
      stored,
      allVerified: stored.every((s) => s.verified),
    });
  });

  app.get('/references/completeness', async (_req, reply) => {
    const suite = await buildLiveReferenceCompletenessSuite();
    return reply.send({
      models: suite,
      allClear: suite.every((r) => !r.bypassDetected),
    });
  });

  app.post<{ Body: { yLimit?: number } }>('/references/d01/analyze', async (req, reply) => {
    const pipeline = await runD01ReferencePipeline({ yLimit: req.body?.yLimit ?? 3 });
    const yMembers = pipeline.yNetwork.components
      .filter((c) => c.trim === 'retained')
      .slice(0, req.body?.yLimit ?? 3)
      .flatMap((component) =>
        deriveYComponentArmSegments(component).map((segment) => ({
          id: segment.id,
          a: segment.a,
          b: segment.b,
        })),
      );
    const analysis = runAnalysisJob({
      requestId: `analysis:${pipeline.pipelineHash.slice(0, 12)}`,
      currentHeadHash: pipeline.pipelineHash,
      yMembers,
      mesh: {
        requestId: `mesh:${pipeline.pipelineHash.slice(0, 12)}`,
        geometryArtifactHash: pipeline.pipelineHash,
        settings: {
          elementSizeMm: 25,
          algorithm: 'frontal',
          determinismClass: 'D1',
        },
        physicalGroups: [
          {
            name: 'material',
            semanticIds: yMembers.map((y) => y.id),
            role: 'material',
          },
        ],
        timeoutMs: 30_000,
        resourceBudgetMb: 256,
        expectedHeadHash: pipeline.pipelineHash,
      },
    });
    if (analysis.status !== 'succeeded' || !analysis.exportFixture) {
      return reply.code(422).send({
        status: analysis.status,
        failureCode: analysis.failureCode ?? 'ANALYSIS_FAILED',
      });
    }
    const stored = artifacts.put(analysis.exportFixture.payload, 'application/json', [
      'd01',
      'analysis',
      'indicative',
    ]);
    return reply.code(201).send({
      status: analysis.status,
      meshArtifactHash: analysis.meshArtifact?.artifactHash,
      elementCount: analysis.meshArtifact?.elementCount ?? 0,
      groupMapping: analysis.meshArtifact?.groupMapping ?? {},
      labelPolicy: analysis.exportFixture.labelPolicy,
      viewportLabels: analysis.results?.viewportLabels ?? [],
      meshMode: analysis.meshArtifact ? 'live-or-fallback' : 'none',
      stored: { contentHash: stored.contentHash, verified: artifacts.verify(stored.contentHash) },
    });
  });

  app.post('/commands/accept', async (req, reply) => {
    const result = acceptSemanticCommand(req.body);
    return reply.code(result.status === 'accepted' ? 202 : 422).send(result);
  });

  app.post<{
    Body: {
      changeSet?: ChangeSet;
      expectedHeadHash?: string;
      yLimit?: number;
      modelId?: string;
    };
  }>('/ai/changeset/accept', async (req, reply) => {
    if (!req.body?.changeSet) {
      return reply.code(422).send({
        status: 'rejected',
        disposition: 'rejected',
        failureCode: 'MISSING_CHANGESET',
        reason: 'changeSet required',
      });
    }
    const result = await acceptAiChangeSet({
      store,
      txEngine,
      queryContexts,
      undoRegistry,
      body: {
        changeSet: req.body.changeSet,
        ...(req.body.expectedHeadHash !== undefined
          ? { expectedHeadHash: req.body.expectedHeadHash }
          : {}),
        ...(req.body.yLimit !== undefined ? { yLimit: req.body.yLimit } : {}),
        ...(req.body.modelId !== undefined ? { modelId: req.body.modelId } : {}),
      },
    });
    return reply.code(result.httpStatus).send(result.body);
  });

  app.get<{ Params: { branchId: string } }>(
    '/branches/:branchId/undo-stack',
    async (req, reply) => {
      return reply.send({
        branchId: req.params.branchId,
        canUndo: undoRegistry.canUndo(req.params.branchId),
        canRedo: undoRegistry.canRedo(req.params.branchId),
      });
    },
  );

  app.post<{
    Params: { branchId: string };
    Body: { expectedHeadHash?: string; actorId?: string };
  }>('/branches/:branchId/undo', async (req, reply) => {
    const expected = req.body?.expectedHeadHash;
    if (!expected) {
      return reply
        .code(422)
        .send({ failureCode: 'MISSING_HEAD', reason: 'expectedHeadHash required' });
    }
    try {
      const result = await undoRegistry.undo({
        branchId: req.params.branchId,
        actorId: req.body?.actorId ?? 'user:ui',
        expectedHeadHash: expected,
      });
      return reply.send({
        status: 'undone',
        newHeadHash: result.newHeadHash,
        groupId: result.group.id,
        canUndo: undoRegistry.canUndo(req.params.branchId),
        canRedo: undoRegistry.canRedo(req.params.branchId),
      });
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'UNDO_FAILED';
      const status = code === 'HEAD_CONFLICT' ? 422 : code === 'UNDO_EMPTY' ? 422 : 500;
      return reply.code(status).send({
        failureCode: code,
        reason: err instanceof Error ? err.message : 'undo failed',
      });
    }
  });

  app.post<{
    Params: { branchId: string };
    Body: { expectedHeadHash?: string; actorId?: string };
  }>('/branches/:branchId/redo', async (req, reply) => {
    const expected = req.body?.expectedHeadHash;
    if (!expected) {
      return reply
        .code(422)
        .send({ failureCode: 'MISSING_HEAD', reason: 'expectedHeadHash required' });
    }
    try {
      const result = await undoRegistry.redo({
        branchId: req.params.branchId,
        actorId: req.body?.actorId ?? 'user:ui',
        expectedHeadHash: expected,
      });
      return reply.send({
        status: 'redone',
        newHeadHash: result.newHeadHash,
        groupId: result.group.id,
        canUndo: undoRegistry.canUndo(req.params.branchId),
        canRedo: undoRegistry.canRedo(req.params.branchId),
      });
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'REDO_FAILED';
      const status = code === 'HEAD_CONFLICT' ? 422 : code === 'REDO_EMPTY' ? 422 : 500;
      return reply.code(status).send({
        failureCode: code,
        reason: err instanceof Error ? err.message : 'redo failed',
      });
    }
  });

  app.post<{ Params: { modelId: string }; Body: unknown }>(
    '/models/:modelId/commands/apply',
    async (req, reply) => {
      try {
        const env = parseSemanticCommand({
          ...(req.body as Record<string, unknown>),
          modelId: req.params.modelId,
        });
        const design = toDesignCommandPayload(env);
        if (!design) {
          return reply.code(202).send({
            status: 'accepted',
            mode: 'non-mutating-or-non-transactional',
            command: env.command,
          });
        }
        if (!env.expectedHeadHash || !env.idempotencyKey) {
          return reply.code(422).send({
            status: 'rejected',
            failureCode: 'HEAD_CONFLICT',
            summary: 'APPLY into transaction requires expectedHeadHash and idempotencyKey',
          });
        }
        const txn = await txEngine.begin({
          modelId: env.modelId,
          branchId: env.branchId,
          actorId: env.actorId,
          actorType: env.actorType,
          expectedHeadHash: env.expectedHeadHash,
          idempotencyKey: env.idempotencyKey,
        });
        const updated = txEngine.appendCommand(txn.id, {
          id: design.id,
          type: design.type,
          targetIds: [...design.targetIds],
          payload: design.payload,
        });
        return reply.code(201).send({
          status: 'accepted',
          mode: 'transaction',
          transaction: updated,
          designCommandType: design.type,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'SEMANTIC_INVALID';
        return reply.code(422).send({
          status: 'rejected',
          failureCode: message.startsWith('HEAD_CONFLICT') ? 'HEAD_CONFLICT' : 'SEMANTIC_INVALID',
          summary: message,
        });
      }
    },
  );

  app.post<{
    Body: {
      filename?: string;
      bytes?: string;
      headerText?: string;
      solidCountHint?: number;
    };
  }>('/imports/step', async (req, reply) => {
    const result = await runStepImportJob({
      jobId: `import:${Date.now()}`,
      filename: req.body?.filename ?? 'part.step',
      bytes: req.body?.bytes ?? '',
      headerText: req.body?.headerText ?? '',
      timeoutMs: 30_000,
      ...(req.body?.solidCountHint !== undefined
        ? { solidCountHint: req.body.solidCountHint }
        : {}),
    });
    if (result.status !== 'succeeded') {
      return reply.code(422).send({
        status: result.status,
        failureCode: result.failureCode,
        viewportReady: false,
      });
    }
    const stored = artifacts.put(
      JSON.stringify({ asset: result.asset, shapes: result.shapes }),
      'application/json',
      ['import', 'step'],
    );
    return reply.code(201).send({
      status: result.status,
      asset: result.asset,
      shapeCount: result.shapes?.length ?? 0,
      viewportReady: result.viewportReady,
      probeMode: result.probeMode,
      stored: { contentHash: stored.contentHash, verified: artifacts.verify(stored.contentHash) },
    });
  });

  const exactMeasureKernel = new InProcessGeometryKernel();

  /** Exact (+ optional OCCT) measure for distance / edge / face area / angle. */
  app.post('/measure', async (req, reply) => {
    try {
      const body = MeasureRequestSchema.parse(req.body);
      const exact = exactMeasureKernel.measure({
        ...body,
        layer: 'reference',
      });
      let occt: MeasureResult | undefined;
      const baseUrl = process.env['GEOMETRY_URL'] ?? process.env['SPDS_GEOMETRY_URL'] ?? '';
      if (baseUrl) {
        try {
          const client = new GeometryClient({ baseUrl });
          occt = await client.measure({
            ...body,
            layer: 'geometry-service',
          });
        } catch {
          /* OCCT optional */
        }
      }
      return reply.send({
        exact,
        ...(occt !== undefined ? { occt } : {}),
      });
    } catch (err) {
      return reply.code(400).send({
        code: 'SEMANTIC_INVALID',
        summary: err instanceof Error ? err.message : 'Invalid measure request',
      });
    }
  });

  /** Load per-user designer UI preferences (theme, viewport, measures). */
  app.get<{ Querystring: { userId?: string } }>('/ui-preferences', async (req, reply) => {
    const userId = req.query.userId?.trim();
    if (!userId) {
      return reply.code(400).send({
        code: 'SEMANTIC_INVALID',
        summary: 'userId query parameter is required',
      });
    }
    const row = await uiPreferences.get(userId);
    if (!row) {
      return reply.send({
        userId,
        payload: {},
        schemaVersion: UI_PREFERENCES_SCHEMA_VERSION,
        updatedAt: null,
      });
    }
    return reply.send({
      userId: row.userId,
      payload: row.payload,
      schemaVersion: row.schemaVersion,
      updatedAt: row.updatedAt,
    });
  });

  /** Upsert per-user designer UI preferences. */
  app.put<{
    Body: {
      userId?: string;
      payload?: UiPreferencesPayload;
      schemaVersion?: string;
    };
  }>('/ui-preferences', async (req, reply) => {
    const userId = req.body.userId?.trim();
    if (!userId) {
      return reply.code(400).send({
        code: 'SEMANTIC_INVALID',
        summary: 'userId is required',
      });
    }
    if (!req.body.payload || typeof req.body.payload !== 'object') {
      return reply.code(400).send({
        code: 'SEMANTIC_INVALID',
        summary: 'payload object is required',
      });
    }
    const row = await uiPreferences.put(
      userId,
      req.body.payload,
      req.body.schemaVersion ?? UI_PREFERENCES_SCHEMA_VERSION,
    );
    return reply.send({
      userId: row.userId,
      payload: row.payload,
      schemaVersion: row.schemaVersion,
      updatedAt: row.updatedAt,
    });
  });

  /** Dimensional check between exact and OCCT (incl. angle in degrees). */
  app.post('/measure/compare', async (req, reply) => {
    try {
      const body = MeasureRequestSchema.parse(req.body);
      const exact = exactMeasureKernel.measure({
        ...body,
        layer: 'reference',
      });
      let occt: MeasureResult | undefined;
      const baseUrl = process.env['GEOMETRY_URL'] ?? process.env['SPDS_GEOMETRY_URL'] ?? '';
      if (baseUrl) {
        try {
          const client = new GeometryClient({ baseUrl });
          occt = await client.measure({
            ...body,
            layer: 'geometry-service',
          });
        } catch {
          /* OCCT optional — compare still returns exact */
        }
      }
      return reply.send(compareMeasureResults(body.kind, body.features, exact, occt));
    } catch (err) {
      return reply.code(400).send({
        code: 'SEMANTIC_INVALID',
        summary: err instanceof Error ? err.message : 'Invalid measure compare request',
      });
    }
  });

  return { app, store, txEngine, artifacts, remoteArtifacts, uiPreferences };
}
