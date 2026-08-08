import Fastify from 'fastify';
import cors from '@fastify/cors';
import { InMemoryVersionStore } from '@spds/version-core';
import { parseSemanticObject } from '@spds/semantic-core';
import {
  QueryAstSchema,
  buildG3bFixture,
  executeQuery,
  explainObject,
  traceLineage,
} from '@spds/semantic-query';
import { DesignCommandSchema, TransactionEngine } from '@spds/transaction-core';
import { runAnalysisJob } from '@spds/analysis-worker';
import {
  InMemoryObjectStore,
  MinioObjectStore,
  minioConfigFromEnv,
} from '@spds/artifact-store';
import { buildA01AssemblyFixture } from '@spds/assembly-core';
import { runStepImportJob } from '@spds/import-worker';
import {
  buildLiveReferenceCompletenessSuite,
  runA01ReferencePipeline,
  runD01ReferencePipeline,
  runF01ReferencePipeline,
} from '@spds/reference-pipeline';

export function buildServer(store = new InMemoryVersionStore()) {
  const app = Fastify({ logger: false });
  void app.register(cors, { origin: true });
  const g3b = buildG3bFixture();
  const txEngine = new TransactionEngine(store);
  const a01 = buildA01AssemblyFixture();
  const artifacts = new InMemoryObjectStore();
  const minioCfg = minioConfigFromEnv();
  const remoteArtifacts = minioCfg ? new MinioObjectStore(minioCfg) : undefined;

  app.get('/health', async () => ({ status: 'ok', service: 'spds-api' }));

  app.post<{ Body: { name: string } }>('/models', async (req, reply) => {
    const model = store.createModel(req.body.name);
    const branchId = store.getMainBranchId(model.modelId);
    return reply.code(201).send({
      model,
      branchId,
      headHash: store.getBranchHead(branchId).headHash,
    });
  });

  app.get<{ Params: { modelId: string; branchId: string } }>(
    '/models/:modelId/branches/:branchId/objects',
    async (req) => ({ objects: store.listObjects(req.params.branchId) }),
  );

  app.post<{
    Params: { modelId: string; branchId: string };
    Body: { expectedHeadHash: string; object: unknown; actorId?: string };
  }>('/models/:modelId/branches/:branchId/objects', async (req, reply) => {
    const object = parseSemanticObject(req.body.object);
    const event = store.upsertObject(
      req.params.branchId,
      { type: 'user', id: req.body.actorId ?? 'api-user' },
      req.body.expectedHeadHash,
      object as Record<string, unknown> & { id: string },
    );
    return reply.code(201).send({ event, headHash: event.afterHash, object });
  });

  app.post<{
    Params: { modelId: string; branchId: string };
    Body: { name?: string };
  }>('/models/:modelId/branches/:branchId/snapshots', async (req, reply) => {
    const snap = store.snapshot(req.params.branchId, req.body?.name);
    return reply.code(201).send({ snapshot: snap });
  });

  app.post<{
    Params: { modelId: string };
    Body: { name: string; fromBranchId: string };
  }>('/models/:modelId/branches', async (req, reply) => {
    const branch = store.createBranch(req.params.modelId, req.body.name, req.body.fromBranchId);
    return reply.code(201).send({ branch });
  });

  app.post<{
    Params: { modelId: string; branchId: string };
    Body: { snapshotId: string; actorId?: string };
  }>('/models/:modelId/branches/:branchId/restore', async (req, reply) => {
    const event = store.restoreToNewHead(
      req.params.branchId,
      req.body.snapshotId,
      { type: 'user', id: req.body.actorId ?? 'api-user' },
    );
    return reply.send({ event, headHash: event.afterHash });
  });

  app.get<{ Params: { modelId: string; branchId: string } }>(
    '/models/:modelId/branches/:branchId/head',
    async (req) => ({ branch: store.getBranchHead(req.params.branchId) }),
  );

  app.post<{ Params: { modelId: string }; Body: unknown }>(
    '/models/:modelId/query',
    async (req, reply) => {
      const ast = QueryAstSchema.parse(req.body);
      return reply.send({ modelId: req.params.modelId, result: executeQuery(g3b.graph, ast) });
    },
  );

  app.post<{
    Params: { modelId: string };
    Body: { targetId: string; changedParameters?: string[] };
  }>('/models/:modelId/explain', async (req, reply) => {
    const packet = explainObject({
      targetId: req.body.targetId,
      graph: g3b.graph,
      provenance: g3b.provenance,
      dependencyEdges: g3b.dependencyEdges,
      ...(req.body.changedParameters !== undefined
        ? { changedParameters: req.body.changedParameters }
        : {}),
    });
    return reply.send({ modelId: req.params.modelId, explain: packet });
  });

  app.post<{ Params: { modelId: string }; Body: { semanticAnchor: string } }>(
    '/models/:modelId/trace',
    async (req, reply) => {
      const steps = traceLineage(g3b.provenance, req.body.semanticAnchor);
      return reply.send({ modelId: req.params.modelId, trace: steps });
    },
  );

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
    const txn = txEngine.begin({
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
      const candidate = txEngine.buildCandidate(req.params.txnId);
      return reply.send({ candidate, transaction: txEngine.getTransaction(req.params.txnId) });
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

  app.post<{ Body: { yLimit?: number } }>('/references/d01/publish', async (req, reply) => {
    const pipeline = await runD01ReferencePipeline({ yLimit: req.body?.yLimit ?? 5 });
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
    return reply.code(201).send({
      release: pipeline.release,
      pipelineHash: pipeline.pipelineHash,
      pirHash: pipeline.pirHash,
      dagHash: pipeline.dagHash,
      stored,
      allVerified: stored.every((s) => s.verified),
      remoteStore: remoteArtifacts ? 'minio' : 'none',
    });
  });

  app.post('/references/a01/publish', async (_req, reply) => {
    const pipeline = await runA01ReferencePipeline();
    const stored = pipeline.representations.map((rep) => {
      const put = artifacts.put(JSON.stringify(rep), 'application/json', ['a01', 'release']);
      return { representationId: rep.id, contentHash: put.contentHash, verified: artifacts.verify(put.contentHash) };
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
      return { representationId: rep.id, contentHash: put.contentHash, verified: artifacts.verify(put.contentHash) };
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
      .map((c) => {
        const origin = c.frame.origin;
        const arm = c.arms[0]!;
        return {
          id: c.id,
          a: origin,
          b: [
            origin[0] + c.frame.tangent[0] * arm.lengthMmPlaceholder,
            origin[1] + c.frame.tangent[1] * arm.lengthMmPlaceholder,
            origin[2] + c.frame.tangent[2] * arm.lengthMmPlaceholder,
          ] as [number, number, number],
        };
      });
    const analysis = runAnalysisJob({
      requestId: `analysis:${pipeline.pipelineHash.slice(0, 12)}`,
      currentHeadHash: pipeline.pipelineHash,
      yMembers,
      mesh: {
        requestId: `mesh:${pipeline.pipelineHash.slice(0, 12)}`,
        geometryArtifactHash: pipeline.pipelineHash,
        settings: {
          elementSizeMm: 25,
          algorithm: 'mock',
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
      labelPolicy: analysis.exportFixture.labelPolicy,
      viewportLabels: analysis.results?.viewportLabels ?? [],
      stored: { contentHash: stored.contentHash, verified: artifacts.verify(stored.contentHash) },
    });
  });

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

  return { app, store, txEngine, artifacts, remoteArtifacts };
}
